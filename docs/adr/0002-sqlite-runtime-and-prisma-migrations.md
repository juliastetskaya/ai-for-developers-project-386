# SQLite runtime and Prisma-authored migrations

Status: accepted

The backend needs durable storage for Meeting Types and Bookings, and booking creation must be atomic: two overlapping Bookings can never be created, even under concurrent requests.

- **Schema and migrations are authored with Prisma.** `apps/backend/prisma/schema.prisma` defines `MeetingType` and `Booking`; the initial SQL lives in `prisma/migrations/<timestamp>_init/migration.sql` and is generated with `prisma migrate diff`. Prisma is a devDependency only.
- **No Prisma Client at runtime.** Prisma 7's SQLite adapter opens deferred transactions and cannot issue `BEGIN IMMEDIATE`, which is required for the booking invariant. We therefore avoid the ORM on the write path rather than patching its transaction mode.
- **One better-sqlite3 connection for the whole process** (`DatabaseService`, a NestJS provider): WAL journaling, `busy_timeout=5000`, foreign keys on. `DATABASE_URL` defaults to `file:./data/dev.db`; relative paths resolve against the backend package directory.
- **Migrations run on startup through that same connection.** The backend applies committed `migration.sql` files in filename order and records them in `_migrations`. There is no separate migrate step, and e2e tests isolate themselves by pointing `DATABASE_URL` at a fresh temp file.
- **Booking creation uses `db.transaction(...).immediate()`**: the overlap `SELECT` (`startAt < :newEnd AND endAt > :newStart`) and the `INSERT` happen inside one immediate transaction. The losing request gets 409 `slot_unavailable`; there are no automatic retries. Any other SQLite failure is logged and mapped to 500 `internal_error`.

Rationale and primary sources: `docs/research/prisma-sqlite-booking-atomicity.md` (branch `research/prisma-sqlite-booking-atomicity`).

## Consequences

- Repositories talk SQL through better-sqlite3; Prisma models are not used as a runtime query API.
- Migration SQL files are the source of truth at runtime, so regenerating them from the schema must be committed together with the schema change.
- Timestamps are stored as UTC ISO-8601 strings so lexicographic comparison matches chronological order.
