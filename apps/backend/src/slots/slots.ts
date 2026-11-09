import { DateTime, Duration } from 'luxon';

export const OWNER_TIMEZONE = 'Europe/Moscow';
export const WORKING_WINDOW_START_HOUR = 9;
export const WORKING_WINDOW_END_HOUR = 18;
export const BOOKING_HORIZON_DAYS = 14;

/** A half-open interval `[startAt, endAt)` in UTC ISO-8601. */
export interface TimeInterval {
  startAt: string;
  endAt: string;
}

export interface SliceSlotsInput {
  /** Calendar date in the owner timezone, formatted as YYYY-MM-DD. */
  date: string;
  durationMin: number;
}

export interface FreeSlotsInput extends SliceSlotsInput {
  /** Existing bookings of any meeting type. */
  busy: readonly TimeInterval[];
  /** The instant to treat as "now". Slots that already started are dropped. */
  now: Date;
}

export interface OwnerHorizon {
  /** Earliest bookable date, YYYY-MM-DD in the owner timezone. */
  earliestDate: string;
  /** Latest bookable date, YYYY-MM-DD in the owner timezone. */
  latestDate: string;
}

const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function ownerDay(date: string): DateTime {
  return DateTime.fromISO(date, { zone: OWNER_TIMEZONE });
}

/** True for a real calendar date formatted exactly as YYYY-MM-DD. */
export function isCalendarDate(value: string): boolean {
  if (!CALENDAR_DATE_PATTERN.test(value)) {
    return false;
  }

  const parsed = ownerDay(value);
  return parsed.isValid && parsed.toISODate() === value;
}

/** Today's date in the owner timezone, formatted as YYYY-MM-DD. */
export function ownerToday(now: Date): string {
  const today = DateTime.fromJSDate(now, { zone: 'utc' })
    .setZone(OWNER_TIMEZONE)
    .toISODate();

  if (today === null) {
    throw new Error('Could not resolve the owner timezone date');
  }

  return today;
}

/** The inclusive 14-calendar-day window that guests may book. */
export function ownerHorizon(now: Date): OwnerHorizon {
  const earliest = ownerDay(ownerToday(now));
  const latest = earliest.plus({ days: BOOKING_HORIZON_DAYS - 1 });

  return {
    earliestDate: earliest.toISODate()!,
    latestDate: latest.toISODate()!,
  };
}

/** The fixed working window of a calendar day, in UTC ISO-8601. */
export function dayWindow(date: string): TimeInterval {
  const day = ownerDay(date);

  return {
    startAt: day
      .set({
        hour: WORKING_WINDOW_START_HOUR,
        minute: 0,
        second: 0,
        millisecond: 0,
      })
      .toUTC()
      .toISO()!,
    endAt: day
      .set({
        hour: WORKING_WINDOW_END_HOUR,
        minute: 0,
        second: 0,
        millisecond: 0,
      })
      .toUTC()
      .toISO()!,
  };
}

/**
 * Slices the working window into slots of `durationMin`, starting at 09:00 in
 * the owner timezone. A slot exists only when it ends at or before 18:00.
 */
export function sliceSlotsForDay({
  date,
  durationMin,
}: SliceSlotsInput): TimeInterval[] {
  if (!Number.isFinite(durationMin) || durationMin <= 0) {
    return [];
  }

  const day = ownerDay(date);
  const windowEnd = day.set({
    hour: WORKING_WINDOW_END_HOUR,
    minute: 0,
    second: 0,
    millisecond: 0,
  });
  const step = Duration.fromObject({ minutes: durationMin });

  const slots: TimeInterval[] = [];
  let start = day.set({
    hour: WORKING_WINDOW_START_HOUR,
    minute: 0,
    second: 0,
    millisecond: 0,
  });

  while (start.plus(step) <= windowEnd) {
    const end = start.plus(step);
    slots.push({
      startAt: start.toUTC().toISO()!,
      endAt: end.toUTC().toISO()!,
    });
    start = end;
  }

  return slots;
}

/** True when half-open intervals `[start, end)` share real time. */
export function intervalsOverlap(a: TimeInterval, b: TimeInterval): boolean {
  return new Date(a.startAt) < new Date(b.endAt) &&
    new Date(a.endAt) > new Date(b.startAt);
}

/**
 * Free slots for one day: the duration grid minus every interval that overlaps
 * an existing booking of any meeting type. Slots that have already started
 * (`start <= now`) are not returned.
 */
export function freeSlotsForDay({
  date,
  durationMin,
  busy,
  now,
}: FreeSlotsInput): TimeInterval[] {
  const nowMs = now.getTime();

  return sliceSlotsForDay({ date, durationMin }).filter(
    (slot) =>
      new Date(slot.startAt).getTime() > nowMs &&
      !busy.some((booking) => intervalsOverlap(slot, booking)),
  );
}
