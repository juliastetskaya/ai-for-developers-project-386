import { DateTime } from 'luxon'

export const OWNER_TIMEZONE = 'Europe/Moscow'
export const BOOKING_HORIZON_DAYS = 14

const LOCALE = 'en'
const DAY_LABEL_FORMAT = 'ccc d LLL'
const DAY_HEADING_FORMAT = 'cccc, d LLLL yyyy'
const DATE_TIME_FORMAT = 'ccc d LLL yyyy, HH:mm'
const TIME_FORMAT = 'HH:mm'

export interface OwnerDay {
  /** Calendar date in the owner timezone, formatted as YYYY-MM-DD. */
  date: string
  /** Short label such as "Tue 10 Nov". */
  label: string
  isToday: boolean
}

/**
 * The 14-day booking horizon, starting today in the owner timezone. Only the
 * dates are computed here; whether a day has free slots is decided by the API.
 */
export function ownerDays(now: Date = new Date()): OwnerDay[] {
  const today = DateTime.fromJSDate(now, { zone: 'utc' })
    .setZone(OWNER_TIMEZONE)
    .startOf('day')

  return Array.from({ length: BOOKING_HORIZON_DAYS }, (_, index) => {
    const day = today.plus({ days: index })

    return {
      date: day.toISODate()!,
      label: day.toFormat(DAY_LABEL_FORMAT, { locale: LOCALE }),
      isToday: index === 0,
    }
  })
}

/**
 * Milliseconds from `now` until the next midnight in the owner timezone.
 * Clamped to a positive value so a timer never spins at the exact boundary.
 */
export function msUntilNextOwnerMidnight(now: Date = new Date()): number {
  const current = DateTime.fromJSDate(now, { zone: 'utc' }).setZone(
    OWNER_TIMEZONE,
  )
  const nextMidnight = current.startOf('day').plus({ days: 1 })

  return Math.max(1, nextMidnight.toMillis() - current.toMillis())
}

/** Formats a UTC ISO-8601 instant as a wall-clock time in the owner timezone. */
export function formatOwnerTime(iso: string): string {
  return DateTime.fromISO(iso, { zone: 'utc' })
    .setZone(OWNER_TIMEZONE)
    .toFormat(TIME_FORMAT)
}

/** Formats a UTC ISO-8601 instant as a date and time in the owner timezone. */
export function formatOwnerDateTime(iso: string): string {
  return DateTime.fromISO(iso, { zone: 'utc' })
    .setZone(OWNER_TIMEZONE)
    .toFormat(DATE_TIME_FORMAT, { locale: LOCALE })
}

/** A long, unambiguous label for a day such as "Tuesday, 10 November 2026". */
export function formatOwnerDayHeading(date: string): string {
  return DateTime.fromISO(date, { zone: OWNER_TIMEZONE }).toFormat(
    DAY_HEADING_FORMAT,
    { locale: LOCALE },
  )
}

/** The owner-timezone calendar date of a UTC ISO-8601 instant. */
export function ownerDateOf(iso: string): string {
  return DateTime.fromISO(iso, { zone: 'utc' })
    .setZone(OWNER_TIMEZONE)
    .toISODate()!
}
