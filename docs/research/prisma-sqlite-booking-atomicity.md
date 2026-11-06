# Prisma + SQLite: механизм атомарного создания брони

Research по тикету [#10](https://github.com/juliastetskaya/ai-for-developers-project-386/issues/10).
Статус: **решение принято** (см. «Итоговое решение»). Ветка не мёржится, PR не открывается.

## Вопрос

Инвариант (тикет [#5](https://github.com/juliastetskaya/ai-for-developers-project-386/issues/5)): два пересекающихся бронирования не могут быть успешно созданы даже при одновременных запросах. Нужен конкретный механизм в связке Prisma + SQLite и обработка ошибок блокировки без случайных HTTP 500.

## Факты (первоисточники)

### SQLite

- Транзакции по умолчанию **DEFERRED**: блокировка не берётся до первого обращения к БД. Если первое обращение — SELECT, начинается read-транзакция; последующая запись пытается сделать upgrade до write-транзакции, который **падает с `SQLITE_BUSY`**, если другая транзакция уже пишет. В WAL-режиме upgrade после чтения падает с `SQLITE_BUSY_SNAPSHOT`, если другая транзакция успела закоммитить. ([lang_transaction.html](https://sqlite.org/lang_transaction.html), [rescode.html#busy_snapshot](https://sqlite.org/rescode.html#busy_snapshot))
- `BEGIN IMMEDIATE` берёт write-lock сразу. Цитата из документации по `SQLITE_BUSY`: «если BEGIN IMMEDIATE успешен, SQLite гарантирует, что ни одна последующая операция в этой транзакции до COMMIT не вернёт SQLITE_BUSY». ([rescode.html#busy](https://sqlite.org/rescode.html#busy))
- `PRAGMA busy_timeout` ставит busy-handler на соединение: ожидание вместо мгновенного `SQLITE_BUSY`. **Не помогает** при `SQLITE_BUSY_SNAPSHOT` (инвалидация снапшота не лечится ожиданием). ([pragma.html#pragma_busy_timeout](https://sqlite.org/pragma.html#pragma_busy_timeout))
- `PRAGMA journal_mode=WAL` персистентен (переживает переподключения); читатели не блокируют единственного писателя. ([pragma.html#pragma_journal_mode](https://sqlite.org/pragma.html#pragma_journal_mode))

### Prisma

- Classic (6.x/7.x): для SQLite поддерживается **только `Serializable`** (он же дефолт). ([архив документации Transactions, 2024-12-27](http://web.archive.org/web/20241227175554/https://www.prisma.io/docs/orm/prisma-client/queries/transactions))
- `P2034` = «Transaction failed due to a write conflict or a deadlock. Please retry your transaction». ([архив error reference, 2025-08-02](http://web.archive.org/web/20250802185337/https://www.prisma.io/docs/orm/reference/error-reference))
- ORM 8 (текущий мажор): `db.transaction(...)` **без опций** `isolationLevel`/`timeout`/`maxWait`; ошибки — структурированные envelope'ы (`RUNTIME.TRANSACTION_COMMIT_FAILED` и др.), P-кодов больше нет. ([Prisma 8 docs: Transactions](https://www.prisma.io/docs/orm/prisma-client/queries/transactions), [Error reference](https://www.prisma.io/docs/orm/reference/error-reference))
- Исходники `@prisma/adapter-better-sqlite3@7.9.1` (`packages/adapter-better-sqlite3/src/better-sqlite3.ts`):
  - транзакция открывается как **`BEGIN` (deferred)** — `BEGIN IMMEDIATE` нативно не поддерживается;
  - `startTransaction` сериализуется **in-process мьютексом** (`async-mutex`) — конкурентные транзакции одного адаптера не interleave'ятся;
  - `isolationLevel !== 'SERIALIZABLE'` → `InvalidIsolationLevel`;
  - фабрика создаёт **одно** соединение better-sqlite3 и пробрасывает `BetterSQLite3Options` (включая `timeout`).
- better-sqlite3: `options.timeout` — busy timeout в мс, **дефолт 5000**; API синхронный; `db.transaction(fn)` — нативные транзакции с вариантами `.deferred()/.immediate()/.exclusive()`. ([WiseLibs/better-sqlite3 api.md](https://raw.githubusercontent.com/WiseLibs/better-sqlite3/master/docs/api.md))

### Известные открытые баги Prisma + SQLite

- [prisma/orm#29870](https://github.com/prisma/orm/issues/29870) — classic engine: N конкурентных интерактивных транзакций > числа worker-потоков → **все** падают с P1008 (порог = logical_cores + 1).
- [prisma/orm#30028](https://github.com/prisma/orm/issues/30028) — adapter-libsql: один транзиентный `SQLITE_BUSY` «отравляет» клиент до рестарта процесса; busy timeout по умолчанию 0.
- [prisma/orm#30881](https://github.com/prisma/orm/issues/30881) — adapter-better-sqlite3: утечка мьютекса, если `BEGIN` бросил исключение (все последующие транзакции висят).
- [prisma/orm#28209](https://github.com/prisma/orm/issues/28209) — `busy_timeout` для миграций не поддержан.

## Оценка вариантов из тикета

- **(а) check+insert под `BEGIN IMMEDIATE`** — гарантирует инвариант на уровне SQLite, но Prisma не даёт `BEGIN IMMEDIATE` нативно (в #30881 люди патчат `db.prepare`, чтобы переписывать `BEGIN` — хрупко).
- **(б) serializable `$transaction` + retry на P2034** — на SQLite Serializable и так дефолт; deferred BEGIN оставляет класс `BUSY_SNAPSHOT`; работает за счёт мьютекса адаптера, но это поведение реализации, не контракт.
- **(в) lock-first write** (первая операция в транзакции — запись в служебную строку) — эмулирует `BEGIN IMMEDIATE`, убирает `BUSY_SNAPSHOT`; рабочий, но неочевидный паттерн поверх ORM.
- **(г) unique-ограничения/индексы** — не выражают непересечение интервалов (диапазонный предикат), отклонено.

## Итоговое решение (принято владельцем продукта)

**Критический путь создания брони — напрямую через better-sqlite3, минуя ORM.** Prisma остаётся для схемы/миграций и некритичных операций (CRUD Meeting Type, чтение списков), где гонки нет.

- Одно разделяемое соединение better-sqlite3 (singleton-провайдер NestJS): `journal_mode=WAL`, `busy_timeout=5000` (дефолт better-sqlite3), `foreign_keys=ON`.
- Создание брони:

  ```ts
  const create = db.transaction((data) => {
    const overlap = db.prepare(
      'SELECT 1 FROM Booking WHERE startAt < ? AND endAt > ? LIMIT 1'
    ).get(data.endAt, data.startAt);
    if (overlap) throw new SlotUnavailableError();
    db.prepare('INSERT INTO Booking (...) VALUES (...)').run(...);
  });
  create.immediate(data); // BEGIN IMMEDIATE — кросс-процессная безопасность в WAL
  ```

  better-sqlite3 синхронный и однопроцессный: тела транзакций не interleave'ятся в принципе — инвариант держится без retry-логики. `.immediate()` дополнительно защищает от внешних писателей (другой процесс в WAL).
- **Маппинг ошибок**: пересечение → доменная ошибка → **409 `slot_unavailable`** (бизнес-путь, не ошибка БД); `SQLITE_BUSY` после исчерпания busy_timeout → без автоматических повторов (решение тикета #5), логируется → 500 `internal_error` через exception filter (в однопроцессном сценарии практически недостижимо). Каталог ошибок — тикет [#14](https://github.com/juliastetskaya/ai-for-developers-project-386/issues/14).
- **Тест гонки** (решение тикета [#6](https://github.com/juliastetskaya/ai-for-developers-project-386/issues/6)): два реально параллельных `POST /bookings` на пересекающиеся интервалы → ровно один 201 и один 409.

## Побочный факт: Europe/Moscow

- IANA tzdb 2026f, файл `europe`: `Zone Europe/Moscow ... 3:00 - MSK` — последняя строка без `UNTIL`: **фиксированный UTC+3 с 2014-10-26, DST-переходов нет**. `Europe/Moscow` — каноническое имя зоны в tzdb (в отличие от `Europe/Tbilisi`, которого в tzdb 2026f нет; каноническое имя — `Asia/Tbilisi`).

## Источники

1. <https://sqlite.org/lang_transaction.html>
2. <https://sqlite.org/rescode.html#busy> и <https://sqlite.org/rescode.html#busy_snapshot>
3. <https://sqlite.org/pragma.html#pragma_busy_timeout>, <https://sqlite.org/pragma.html#pragma_journal_mode>
4. <http://web.archive.org/web/20241227175554/https://www.prisma.io/docs/orm/prisma-client/queries/transactions> (Prisma 6/7: матрица уровней изоляции)
5. <http://web.archive.org/web/20250802185337/https://www.prisma.io/docs/orm/reference/error-reference> (P2034)
6. <https://www.prisma.io/docs/orm/prisma-client/queries/transactions> (Prisma ORM 8)
7. <https://github.com/prisma/prisma/blob/7.9.1/packages/adapter-better-sqlite3/src/better-sqlite3.ts>
8. <https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md>
9. GitHub issues: prisma/orm#29870, #30028, #30881, #28209
10. <https://data.iana.org/time-zones/tzdb/europe> (tzdb 2026f)
