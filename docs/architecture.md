# Архитектура Call Calendar

Упрощённый клон cal.com: один заранее заданный Calendar Owner публикует Meeting Types, Guests
бронируют Slots без регистрации. Приложение однопользовательское, без авторизации и без
интеграций с внешними календарями — границы выбраны осознанно (см. [Границы и ограничения](#границы-и-ограничения)).

Термины домена — из [`GLOSSARY.md`](../GLOSSARY.md). Решения, повлиявшие на устройство, —
в [`docs/adr/`](adr/).

## Содержание

- [Стек](#стек)
- [Структура монорепозитория](#структура-монорепозитория)
- [Поток запроса](#поток-запроса)
- [Backend](#backend)
- [Домен и бизнес-правила](#домен-и-бизнес-правила)
- [Данные и миграции](#данные-и-миграции)
- [API-контракт и SDK](#api-контракт-и-sdk)
- [Frontend](#frontend)
- [Конфигурация](#конфигурация)
- [Сборка, запуск и деплой](#сборка-запуск-и-деплой)
- [Тестирование](#тестирование)
- [Границы и ограничения](#границы-и-ограничения)

## Стек

| Слой | Технологии |
| --- | --- |
| Backend | NestJS 12 (ESM), better-sqlite3, luxon, oxlint |
| Frontend | React 19, Vite, Tailwind CSS 4, shadcn/ui, react-router, Vitest + Testing Library |
| Контракт | TypeSpec → OpenAPI → `@hey-api/openapi-ts` SDK |
| Данные | SQLite; Prisma используется только для описания схемы и миграций |
| Инструменты | pnpm 10 (workspace), mise (Node 22, pnpm, hk, pitchfork), Docker |

## Структура монорепозитория

```text
apps/backend/                 NestJS API и раздача собранного SPA
├── prisma/schema.prisma      модели Meeting Type и Booking (только источник миграций)
├── prisma/migrations/        SQL-миграции, применяются при старте
└── src/
    ├── main.ts               bootstrap, $PORT, shutdown hooks, SPA
    ├── app.module.ts         корневой модуль
    ├── app.setup.ts          общая конфигурация (CORS) для main и e2e
    ├── static-frontend.ts    статика SPA + fallback, минуя API-префиксы
    ├── database/             единственное подключение SQLite + миграции
    ├── common/               конверт ошибок, коды, валидация
    ├── slots/                чистая логика Working Window, горизонта и нарезки Slots
    ├── meeting-types/        controller → service → repository
    ├── availability/         свободные Slots одного дня
    ├── bookings/             создание и список Bookings
    └── health/               GET /health

apps/frontend/                React SPA
└── src/
    ├── pages/                Landing, Booking Page, Owner Dashboard
    ├── components/           layout, календарь, async-section, ui (shadcn)
    └── lib/                  API-клиент, 14-дневный горизонт, формы, лимиты

packages/api-client/          сгенерированный типизированный SDK
typespec/main.tsp             исходный контракт API
e2e/                          Playwright golden path
scripts/                      проверки версий, CI-конфига, release-please, backend для Playwright
```

Сгенерированные каталоги (`typespec/tsp-output/`, `packages/api-client/src/client/`)
пересоздаются командой `pnpm generate:api` и руками не правятся.

## Поток запроса

```text
браузер
  └─ SPA (React) ── fetch /meeting-types ──┐
                                           ▼
                        NestJS HTTP (порт $PORT)
                          ├─ AllExceptionsFilter   единый конверт ошибок
                          ├─ Controller            разбор входа, HTTP-статусы
                          ├─ Service               валидация и бизнес-правила
                          ├─ Repository            SQL через better-sqlite3
                          └─ DatabaseService       одно соединение SQLite (WAL)
                                           │
                                           ▼
                                /data/app.db (SQLite)

статический GET (не /health, /meeting-types, /availability, /bookings)
  └─ static-frontend.ts ──> apps/frontend/dist/index.html (+ /assets/*)
```

В production backend раздаёт и API, и SPA с одного origin, поэтому браузер ходит по относительным
путям и CORS не участвует в основном сценарии.

## Backend

Слои внутри каждого модуля одинаковы: controller отвечает за HTTP, service — за валидацию и
правила, repository — за SQL. Контроллеры не ходят в базу напрямую.

| Модуль | Ответственность |
| --- | --- |
| `DatabaseModule` (`@Global`) | единственное подключение better-sqlite3: `journal_mode=WAL`, `busy_timeout=5000`, `foreign_keys=ON`; применяет миграции до первого запроса |
| `HealthModule` | `GET /health` → `{ "status": "ok" }` |
| `MeetingTypesModule` | список и создание Meeting Types; лимиты полей и тримминг |
| `AvailabilityModule` | свободные Slots на дату для выбранного Meeting Type |
| `BookingsModule` | создание Booking (атомарно) и список предстоящих |
| `slots/` | чистые функции: рабочее окно, горизонт, нарезка на Slots, проверка выравнивания |
| `common/` | `ApiError`, коды ошибок, чтение и валидация полей, `AllExceptionsFilter` |

**Ошибки.** Любое исключение превращается в один конверт
`{ statusCode, code, message, details? }`. Коды: `validation_failed`, `meeting_type_not_found`,
`date_out_of_range`, `slot_unavailable`, `not_found`, `request_error`, `internal_error`.
Неизвестные исключения логируются и отдаются как 500 без внутренних деталей.

## Домен и бизнес-правила

**Пользовательский путь.** Calendar Owner создаёт Meeting Type в Owner Dashboard (`/admin`) и
видит там все предстоящие Bookings. Guest на Booking Page (`/book`) выбирает Meeting Type, день
из 14-дневного горизонта и свободный Slot, затем вводит имя, email и комментарий.

**Константы домена** (`apps/backend/src/slots/slots.ts`, зеркало в frontend):

| Правило | Значение |
| --- | --- |
| Часовой пояс владельца | `Europe/Moscow`, фиксирован, пользователь его не выбирает |
| Working Window | 09:00–18:00 по поясу владельца |
| Горизонт бронирования | 14 дней, начиная с сегодняшнего дня владельца |
| Длительность Meeting Type | 5–240 минут |

**Slots.** Внутри Working Window день нарезается на полуинтервалы `[startAt, endAt)` по
длительности Meeting Type. Slot свободен, если его интервал не пересекается ни с одной Booking —
любого Meeting Type. Начавшиеся Slots отбрасываются; границы окна и сетки проверяются и на
клиенте, и на сервере.

**Глобальная занятость.** Пересечение по времени блокирует интервал для всех типов встреч:
предикат `startAt < newEnd AND endAt > newStart`.

**Атомарность бронирования.** Проверка пересечения и вставка выполняются в одной транзакции
`BEGIN IMMEDIATE` (`.immediate()` в better-sqlite3). Проигравший конкурентный запрос видит чужую
строку и получает 409 `slot_unavailable`; ретраев нет. Любая другая ошибка SQLite логируется и
превращается в 500 `internal_error`.

**Время.** Хранение и API работают в UTC ISO-8601, поэтому лексикографическое сравнение строк
совпадает с хронологическим. Пояс владельца применяется только при вычислении дат и подписей.
Подробности — [ADR 0003](adr/0003-owner-timezone-and-booking-horizon.md).

## Данные и миграции

Схема описана в `apps/backend/prisma/schema.prisma`: `MeetingType` и `Booking` со связью
`Booking.meetingTypeId → MeetingType.id` (`ON DELETE RESTRICT`) и индексами под предикат
пересечения и выборку по типу.

- **Prisma — только инструмент автора схемы** (devDependency). SQL-миграции лежат в
  `prisma/migrations/<timestamp>_<name>/migration.sql`; Prisma Client в рантайме не используется.
- **Миграции применяет сам backend при старте**: `DatabaseService` читает каталог `prisma/migrations`
  из рабочего каталога, выполняет ещё не применённые файлы по порядку и пишет их в `_migrations`.
  Повторный запуск безопасен, отдельный migrate-шаг не нужен.
- **Одно соединение на процесс** — так транзакции не конкурируют внутри приложения; WAL и
  `busy_timeout` защищают от внешних писателей.
- Локально база живёт в `apps/backend/data/dev.db` (или на томе в Docker), на Render — в
  `/data/app.db`.

Причины решения и цена отказа от Prisma Client — [ADR 0002](adr/0002-sqlite-runtime-and-prisma-migrations.md).

## API-контракт и SDK

Источник истины — `typespec/main.tsp`. Пайплайн:

```text
typespec/main.tsp
  └─ pnpm generate:api
       ├─ tsp compile → typespec/tsp-output/.../openapi.yaml
       └─ @hey-api/openapi-ts → packages/api-client/src/client/
```

Frontend импортирует типы и функции из `api-client`, поэтому расхождение контракта и клиента —
ошибка компиляции, а не runtime-сюрприз. Backend-контроллеры написаны руками (подходящего
генератора серверного кода нет) и держатся в соответствии с контрактом через API e2e-тесты.

| Метод и путь | Назначение |
| --- | --- |
| `GET /health` | проверка живости |
| `GET /meeting-types` | список Meeting Types (публично) |
| `POST /meeting-types` | создать Meeting Type |
| `GET /availability?meetingTypeId&date` | свободные Slots дня (дата в поясе владельца) |
| `GET /bookings?scope=upcoming` | предстоящие Bookings с вложенным Meeting Type |
| `POST /bookings` | создать Booking; пересечение → 409 |

## Frontend

| Маршрут | Страница | Что делает |
| --- | --- | --- |
| `/` | Landing | описывает сервис и ведёт на Booking Page |
| `/book` | Booking Page | Meeting Type → день → Slot → форма гостя → подтверждение |
| `/admin` | Owner Dashboard | создание Meeting Types и список предстоящих Bookings |

- `lib/api.ts` настраивает сгенерированный клиент на `VITE_API_URL` (по умолчанию
  `http://localhost:3000`) и приводит любую ошибку к `{ status, code, message, details }`.
- `lib/owner-days.ts` строит 14-дневный горизонт в поясе владельца; какие дни доступны, решает API.
- `components/async-section.tsx` — единые состояния загрузки/ошибки/пустоты для страниц.
- В production `VITE_API_URL` пустой, поэтому запросы идут на тот же origin.

## Конфигурация

| Переменная | Где нужна | Значение по умолчанию |
| --- | --- | --- |
| `PORT` | backend | `3000`; платформа передаёт свой (Render — `10000`) |
| `DATABASE_URL` | backend | `file:./data/dev.db` относительно `apps/backend` |
| `FRONTEND_DIST` | backend | `apps/frontend/dist` |
| `VITE_API_URL` | build frontend | `http://localhost:3000`; в образе — пустая строка |

Секретов приложение не использует: авторизации нет, внешних сервисов нет.

## Сборка, запуск и деплой

- **Dev:** `mise run dev:backend` (3000) и `mise run dev:frontend` (5173); SPA ходит в API по
  адресу из `VITE_API_URL`.
- **Прод-образ:** multi-stage `Dockerfile` — install → `generate:api` → `nest build` → `vite build`
  → production-зависимости. NestJS раздаёт SPA и API на одном `$PORT`.
- **Права:** `docker-entrypoint.sh` стартует от root только чтобы выставить владельца `/data`,
  затем через `setpriv` запускает приложение от пользователя `node`.
- **Compose:** тот же образ с именованным томом `sqlite-data` для локальной проверки прод-режима.
- **Render:** Blueprint `render.yaml` (Docker, health check `/health`, `plan: free`,
  `autoDeployTrigger: checksPass`). На free-плане диск недоступен, поэтому SQLite эфемерный и
  обнуляется при деплое/рестарте — принятый режим для демо. Детали и переключение на постоянный
  диск — [`docs/deploy.md`](deploy.md).

## Тестирование

| Уровень | Инструмент | Что покрывает |
| --- | --- | --- |
| Backend unit | Vitest | `slots` (окно, горизонт, нарезка), парсинг и валидация, `DatabaseService` и миграции |
| Backend e2e | Vitest + supertest, временная SQLite | HTTP-контракт, коды ошибок, гонка за Slot, миграции с нуля |
| Frontend | Vitest + Testing Library | страницы, календарь, горизонт, обработка ошибок API |
| Golden path | Playwright, реальные серверы | путь гостя целиком: Landing → `/book` → Slot → подтверждение |

Golden path поднимает backend на `3100` и frontend на `5273`, использует отдельную базу во
временном каталоге и не зависит от dev-данных. Он входит в `mise run check` и в CI.

## Границы и ограничения

- Нет авторизации, аккаунтов и ролей: Owner Dashboard открыт всем, кто знает адрес.
- Нет отмены и переноса Bookings, уведомлений и синхронизации с внешними календарями.
- Часовой пояс не выбирается: он фиксирован за владельцем (`Europe/Moscow`).
- Данные на бесплатном Render эфемерны: контейнер пересоздаётся — база пустая.
- Приложение рассчитано на один инстанс: SQLite-файл и один процесс; горизонтального
  масштабирования нет.
