# Релизы

Релизы готовятся автоматически через [release-please](https://github.com/googleapis/release-please).
Стратегия версий — единая для всего монорепозитория, подробности — в
[versioning.md](versioning.md).

## Что настроено

- `.github/workflows/release-please.yml` — workflow на push в `main` с правами
  `contents: write` и `pull-requests: write` (плюс `issues: write` для меток). Передаёт
  `token: ${{ secrets.RELEASE_PLEASE_TOKEN || secrets.GITHUB_TOKEN }}`: при наличии PAT
  Release PR создаётся от него, иначе workflow остаётся secret-free и использует
  встроенный `GITHUB_TOKEN`.
- `release-please-config.json` — один пакет `"."` с `release-type: node` и
  `include-component-in-tag: false`, поэтому теги имеют вид `vX.Y.Z`, а не `cal-clone-vX.Y.Z`.
  В `extra-files` перечислены все workspace-манифесты с JSON-обновлением `$.version`.
- `.release-please-manifest.json` — текущая версия проекта; release-please обновляет её в
  Release PR.
- `scripts/check-release-please.mjs` — офлайн-проверка согласованности конфигурации
  (входит в `mise run check` через `check:release-please`).

## Как проходит релиз

1. Коммит с Conventional Commits попадает в `main` (формат проверяет хук `commit-msg`).
2. Workflow открывает или обновляет Release PR `chore(main): release X.Y.Z`. В PR меняются:
   - `version` в корневом `package.json`;
   - `version` во всех workspace-пакетах из `extra-files`;
   - `.release-please-manifest.json`;
   - `CHANGELOG.md` (создаётся при первом релизе).
3. Мёрж Release PR → release-please создаёт GitHub Release и тег `vX.Y.Z`.
4. `mise run check` проверяет, что версия манифеста совпадает с корневой, а `extra-files`
   покрывает все workspace-пакеты из `pnpm-workspace.yaml`.

Release PR обновляется при новых коммитах и остаётся открытым, пока его не смёржат —
релиз не создаётся на каждый push.

## Типы коммитов и версия

Release-please использует Conventional Commits и версионирование по умолчанию (SemVer):

| Коммит | Версия | CHANGELOG |
| --- | --- | --- |
| `feat: ...` | minor (`1.0.0` → `1.1.0`) | Features |
| `fix: ...` | patch (`1.0.0` → `1.0.1`) | Bug Fixes |
| `perf: ...` | patch | Performance Improvements |
| `revert: ...` | patch | Reverts |
| `<type>!: ...` или футер `BREAKING CHANGE:` | major (`1.0.0` → `2.0.0`) | Breaking Changes |
| `docs`, `style`, `refactor`, `test`, `build`, `ci`, `chore` | без релиза | скрыты |

Breaking change срабатывает для любого типа, в том числе для скрытого: `chore!: ...` даст
major. Если между релизами были только «нерелизные» типы, Release PR не создаётся.

## Правила

- Версии руками не правят: корневую версию и версии workspace-пакетов обновляет
  release-please.
- Новый workspace-пакет нужно добавить в `extra-files`. Это поймают и `check:versions`
  (версия не совпадёт), и `check-release-please` (сравнивает `extra-files` с
  `pnpm-workspace.yaml`).
- `bootstrap-sha` нужен только для первого запуска: он ограничивает историю, попадающую в
  первый CHANGELOG. После мёржа первого Release PR его можно удалить.
- `CHANGELOG.md` генерируется release-please — не редактируйте его вручную.
- Для нестандартного релиза используйте футер `Release-As: X.Y.Z` в коммите; это исключение,
  а не повседневный способ.

## Токен и защита ветки (обязательно для авто-мёржа Release PR)

`main` защищена: required check `check` работает в strict-режиме, админы тоже не обходят
защиту (см. [ci.md](ci.md)). GitHub **не запускает** другие workflow для событий, созданных
встроенным `GITHUB_TOKEN` (защита от рекурсии). Поэтому Release PR, открытый от
`GITHUB_TOKEN`, не получит required check `check` и не сможет быть смёржен.

Чтобы Release PR проходил CI и мёржился, настройте репозиторный fine-grained PAT:

1. Создайте PAT с правами `contents: write` и `pull-requests: write` (scope — только этот
   репозиторий).
2. Сохраните его в секрете `RELEASE_PLEASE_TOKEN`
   (Settings → Secrets and variables → Actions → New repository secret).
3. Workflow подхватит его автоматически через
   `token: ${{ secrets.RELEASE_PLEASE_TOKEN || secrets.GITHUB_TOKEN }}`.

Без PAT workflow продолжает работать без секретов и откроет Release PR от `GITHUB_TOKEN`,
но такой PR не запустит `check`. В этом случае остаётся только один путь: владелец вручную
добавляет bypass для Release PR в настройках branch protection. Это осознанный компромисс,
а не рекомендуемый режим: секрет в `check.yml` не добавляется, fork-PR остаются безопасными.

Дополнительно включите «Allow GitHub Actions to create and approve pull requests»
(Settings → Actions → General), иначе Release PR не создастся даже с PAT.

