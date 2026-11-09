# Версионирование монорепозитория

## Решение

В проекте одна версия на весь монорепозиторий. Независимые релизы workspace-пакетов не нужны:
`apps/backend` и `apps/frontend` — приватные приложения, `packages/api-client` и `typespec` —
внутренние артефакты, которые никуда не публикуются. Наружу ничего не поставляется, поэтому
версия описывает проект целиком, а не отдельные пакеты.

## Единственный источник версии

Источник истины — поле `version` в **корневом** `package.json` (сейчас `1.0.0`).

Все workspace-пакеты обязаны иметь ровно ту же версию. Список пакетов берётся из
`pnpm-workspace.yaml` (`apps/*`, `packages/*`, `typespec`), поэтому новый пакет автоматически
попадает под правило.

## Правило синхронизации

Скрипт `scripts/sync-versions.mjs` (Node, без дополнительных зависимостей) читает версию из
корневого манифеста и приводит к ней `version` во всех workspace-манифестах:

```bash
pnpm sync-versions          # записать версию во все workspace-пакеты
pnpm check-versions         # только проверить, при расхождении — exit 1
```

`pnpm check-versions` входит в `mise run check` (задача `check:versions`) вместе с юнит-тестами
самого скрипта. Если версии разъехались, гейт падает со списком файлов и ожидаемой версией:

```
Workspace package versions do not match the root version 1.0.0:
  apps/backend/package.json: 0.0.1 -> 1.0.0
Run 'pnpm sync-versions' to fix.
```

### Как менять версию

1. Изменить `version` в корневом `package.json`.
2. Выполнить `pnpm sync-versions`.
3. Закоммитить корневой манифест и обновлённые `package.json` пакетов вместе.

Руками версии в пакетах не правят: их всегда перезаписывает скрипт.

## Связь с release-please (#24)

Релизами управляет release-please через `release-please-config.json` (release-type `node`)
для корневого пакета. Корневой `package.json` он обновляет сам, а workspace-манифесты нужно
явно перечислить в `extra-files` с JSON-обновлением поля `version`, иначе релизный PR изменит
только корень и уронит `check:versions`. Полный флоу релизов, типы коммитов и правила —
в [releases.md](releases.md).

```json
{
  "packages": {
    ".": {
      "release-type": "node",
      "extra-files": [
        { "type": "json", "path": "apps/backend/package.json", "jsonpath": "$.version" },
        { "type": "json", "path": "apps/frontend/package.json", "jsonpath": "$.version" },
        { "type": "json", "path": "packages/api-client/package.json", "jsonpath": "$.version" },
        { "type": "json", "path": "typespec/package.json", "jsonpath": "$.version" }
      ]
    }
  }
}
```

При добавлении нового workspace-пакета его `package.json` нужно добавить и в `extra-files`, иначе
версия в нём останется старой и `mise run check` это поймает.
