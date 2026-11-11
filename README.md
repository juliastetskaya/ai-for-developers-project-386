# Календарь звонков

[![hexlet-check](https://github.com/juliastetskaya/ai-for-developers-project-386/actions/workflows/hexlet-check.yml/badge.svg)](https://github.com/juliastetskaya/ai-for-developers-project-386/actions)

Упрощённый клон cal.com: один владелец календаря публикует типы встреч, гости бронируют
свободные слоты без регистрации. Однопользовательское приложение без авторизации; часовой
пояс владельца фиксирован (`Europe/Moscow`), хранение и API работают в UTC.

Демо: **https://cal-clone-3v43.onrender.com** — `/book` для гостя, `/admin` для владельца.
Бесплатный план Render держит SQLite на эфемерной файловой системе: данные сбрасываются при
каждом деплое и рестарте (см. [деплой](docs/deploy.md)).

## Возможности

- Владелец создаёт **Meeting Types** (название, описание, длительность 5–240 минут) и видит все
  предстоящие **Bookings**.
- Гость выбирает тип встречи, день из 14-дневного горизонта и свободный **Slot**, затем оставляет
  имя, email и комментарий.
- Свободные слоты = рабочее окно 09:00–18:00 минус занятые интервалы; пересечение по времени
  блокирует слот глобально для всех типов встреч.
- Бронь создаётся атомарно: гонка за слот заканчивается `409 slot_unavailable` для проигравшего.

Подробности устройства, слоёв и инвариантов — в [docs/architecture.md](docs/architecture.md).

## Быстрый старт

Окружение и версии инструментов фиксирует [mise](https://mise.jdx.dev/): Node 22, pnpm 10, hk,
pitchfork.

```bash
git clone https://github.com/juliastetskaya/ai-for-developers-project-386.git
cd ai-for-developers-project-386
mise install     # инструменты из mise.toml
mise run setup   # зависимости + сгенерированный API SDK
mise run dev:backend    # API на http://localhost:3000
mise run dev:frontend   # SPA на http://localhost:5173
```

## Команды

| Команда | Что делает |
| --- | --- |
| `mise run dev:backend` / `dev:frontend` | dev-серверы по отдельности; `mise daemons start` — оба в фоне |
| `mise run build` | сборка backend и frontend |
| `mise run test` | unit- и e2e-тесты backend, тесты frontend |
| `mise run e2e:golden` | Playwright golden path гостя против реальных серверов |
| `mise run docker:build` / `docker:up` / `docker:down` | прод-образ и локальный запуск через Compose |
| `mise run check` | полный гейт: lint, типы, тесты, golden path, сборка, свежесть SDK, версии, CI-конфиг |
| `pnpm generate:api` | перегенерировать OpenAPI и SDK после правок `typespec/` |

`mise run check` — то же, что запускает CI; он должен быть зелёным перед мёржем.
Git-хуки (hk): lint на коммит, `mise run check` на пуш, Conventional Commits в сообщении.

## Документация

| Документ | О чём |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | слои, поток запроса, домен, данные, тестирование |
| [docs/deploy.md](docs/deploy.md) | Render, порт, миграции, ограничения free-плана |
| [docs/ci.md](docs/ci.md) | пайплайн, задачи `check` и `docker`, branch protection |
| [docs/releases.md](docs/releases.md) | release-please, теги и CHANGELOG |
| [docs/versioning.md](docs/versioning.md) | единая версия во всех пакетах |
| [GLOSSARY.md](GLOSSARY.md) | язык домена: Meeting Type, Booking, Slot, Working Window |
| [docs/adr/](docs/adr/) | принятые архитектурные решения |
| [AGENTS.md](AGENTS.md) | соглашения для агентов и участников |

## Стек

NestJS 12 + better-sqlite3 на бэкенде, React 19 + Vite + Tailwind CSS 4 на фронтенде,
TypeSpec → OpenAPI → типизированный SDK в `packages/api-client`, pnpm-workspace, Docker и
Render Blueprint.
