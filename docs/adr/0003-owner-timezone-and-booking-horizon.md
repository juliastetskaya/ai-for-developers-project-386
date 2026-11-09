# Owner timezone and booking horizon

Status: accepted

The service is single-user and the spec deliberately leaves out per-user timezone selection and configurable schedules. We therefore pin the time rules instead of deriving them from the guest's or server's local clock:

- **Owner timezone is a fixed constant:** `Europe/Moscow`. Working hours, "today", and the booking horizon are all computed in this zone; the API and SQLite store UTC ISO-8601 instants (`toISOString()`), and conversion happens only at the boundaries. Guests see Slot times in the owner timezone.
- **Working Window is 09:00–18:00 every day** (all seven weekdays, no holidays or exceptions). The window is a constant, not a setting.
- **Booking horizon is 14 calendar days**, from today in the owner timezone through today + 13 (inclusive). A date before today or beyond that window is rejected with `date_out_of_range`; a `POST /bookings` start outside the horizon is a `validation_failed` error on `startAt`.
- **Slot grid:** for a Meeting Type of duration `d`, Slot starts are `09:00 + k·d` in the owner timezone, and a Slot exists only while `start + d ≤ 18:00`. The last Slot of a 30-minute type starts at 17:30 and ends exactly at 18:00.
- **Today's started Slots are omitted:** a Slot whose start is at or before `now` is not returned (`start <= now`).
- **One rule, two consumers:** `apps/backend/src/slots/slots.ts` owns the grid, window, horizon, and overlap primitives. The availability endpoint and the `POST /bookings` guard both use them, so the server is the final authority regardless of the UI. The frontend keeps display constants (`Europe/Moscow`, 14 days) for UX only.

IANA tzdb applies `Europe/Moscow` as a fixed UTC+3 offset (no DST since 2014), but the implementation still uses Luxon with the IANA zone rather than hardcoding an offset.

## Consequences

- Moving the owner to another timezone or changing working hours requires a code and ADR change, not a configuration toggle.
- A page left open across owner-timezone midnight refreshes its day list (focus/visibility plus a midnight timer); the server remains the final guard.
- Stored timestamps are UTC strings, so lexicographic comparison matches chronological order and overlap queries stay simple.
