import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import {
  meetingTypeNotFound,
  validationFailed,
} from '../common/api-error.js';
import {
  asRecord,
  readInteger,
  readString,
  ValidationErrors,
} from '../common/validation.js';
import { MeetingTypesService } from '../meeting-types/meeting-types.service.js';
import { dayWindow, ownerHorizon, OWNER_TIMEZONE } from '../slots/slots.js';
import type { Booking } from './booking.js';
import { BookingsRepository } from './bookings.repository.js';

export const GUEST_NAME_MAX_LENGTH = 100;
export const GUEST_EMAIL_MAX_LENGTH = 320;
export const COMMENT_MAX_LENGTH = 2000;
export const UPCOMING_SCOPE = 'upcoming';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** ISO-8601 instants must carry an explicit `Z` or numeric UTC offset. */
const EXPLICIT_OFFSET_PATTERN = /(?:Z|[+-]\d{2}:?\d{2})$/i;

const START_AT_FORMAT_MESSAGE =
  'Must be a valid ISO-8601 timestamp with an offset or Z.';

export interface ParsedCreateBooking {
  meetingTypeId: number | null;
  /** Parsed instant, always normalized to UTC. */
  startAt: DateTime | null;
  guestName: string | null;
  guestEmail: string | null;
  comment: string | null;
  errors: ValidationErrors;
}

function parseStartAt(value: string): DateTime | null {
  if (!EXPLICIT_OFFSET_PATTERN.test(value)) {
    return null;
  }

  const parsed = DateTime.fromISO(value, { setZone: true });
  return parsed.isValid ? parsed.toUTC() : null;
}

/**
 * Validates a `POST /bookings` body and normalizes the fields for storage.
 * Every invalid field produces exactly one entry in `details.fields`. The
 * result is returned even when there are errors so the caller can add the
 * server-side `startAt` guards before raising one combined validation error.
 */
export function parseCreateBooking(body: unknown): ParsedCreateBooking {
  const errors = new ValidationErrors();
  const record = asRecord(body) ?? {};

  const meetingTypeId = readInteger(record, 'meetingTypeId', errors, {
    required: true,
  });

  const guestName = readString(record, 'guestName', errors, {
    required: true,
  });
  if (guestName !== null && guestName.length > GUEST_NAME_MAX_LENGTH) {
    errors.add(
      'guestName',
      `Must be at most ${GUEST_NAME_MAX_LENGTH} characters.`,
    );
  }

  const guestEmail = readString(record, 'guestEmail', errors, {
    required: true,
  });
  if (guestEmail !== null) {
    if (guestEmail.length > GUEST_EMAIL_MAX_LENGTH) {
      errors.add(
        'guestEmail',
        `Must be at most ${GUEST_EMAIL_MAX_LENGTH} characters.`,
      );
    } else if (!EMAIL_PATTERN.test(guestEmail)) {
      errors.add('guestEmail', 'Must be a valid email address.');
    }
  }

  const comment = readString(record, 'comment', errors);
  if (comment !== null && comment.length > COMMENT_MAX_LENGTH) {
    errors.add('comment', `Must be at most ${COMMENT_MAX_LENGTH} characters.`);
  }

  const startAtValue = readString(record, 'startAt', errors, {
    required: true,
  });
  let startAt: DateTime | null = null;
  if (startAtValue !== null) {
    startAt = parseStartAt(startAtValue);
    if (startAt === null) {
      errors.add('startAt', START_AT_FORMAT_MESSAGE);
    }
  }

  return {
    meetingTypeId,
    startAt,
    guestName,
    guestEmail,
    comment: comment === '' ? null : comment,
    errors,
  };
}

/**
 * Server-side booking guards: the API is the source of truth, so a slot must be
 * in the future, inside the 14-day owner horizon, inside the working window and
 * aligned to the slot grid for this meeting type's duration.
 *
 * Returns the first violated rule, or `null` when the start is bookable. Only
 * one message is returned so the field has exactly one error entry.
 */
export function startAtViolation(
  start: Date,
  durationMin: number,
  now: Date,
): string | null {
  if (start.getTime() <= now.getTime()) {
    return 'Must be in the future.';
  }

  const date = DateTime.fromJSDate(start, { zone: 'utc' })
    .setZone(OWNER_TIMEZONE)
    .toISODate();

  const { earliestDate, latestDate } = ownerHorizon(now);
  if (date === null || date < earliestDate || date > latestDate) {
    return 'Must be within the next 14 days.';
  }

  const window = dayWindow(date);
  const windowStart = new Date(window.startAt).getTime();
  const windowEnd = new Date(window.endAt).getTime();
  const startMs = start.getTime();
  const endMs = startMs + durationMin * 60_000;

  if (startMs < windowStart || endMs > windowEnd) {
    return 'Must be within the working window (09:00–18:00 Europe/Moscow).';
  }

  if ((startMs - windowStart) % (durationMin * 60_000) !== 0) {
    return 'Must align with a valid slot start.';
  }

  return null;
}

/**
 * Validates the `GET /bookings` query. The list endpoint supports exactly one
 * scope for now; anything else is a field-level `validation_failed` error.
 */
export function parseListBookingsQuery(
  query: Record<string, unknown>,
): void {
  const errors = new ValidationErrors();

  const scope = readString(query, 'scope', errors, { required: true });
  if (scope !== null && scope !== UPCOMING_SCOPE) {
    errors.add('scope', 'Must be "upcoming".');
  }

  errors.throwIfAny();
}

@Injectable()
export class BookingsService {
  constructor(
    private readonly meetingTypes: MeetingTypesService,
    private readonly repository: BookingsRepository,
  ) {}

  listUpcoming(
    query: Record<string, unknown>,
    now: Date = new Date(),
  ): Booking[] {
    parseListBookingsQuery(query);

    return this.repository.listUpcoming(now.toISOString());
  }

  create(body: unknown, now: Date = new Date()): Booking {
    const parsed = parseCreateBooking(body);
    const { errors } = parsed;

    const meetingType =
      parsed.meetingTypeId === null
        ? null
        : this.meetingTypes.find(parsed.meetingTypeId);

    if (parsed.meetingTypeId !== null && meetingType === null) {
      // Field-level problems take priority; otherwise the meeting type is the
      // only thing wrong and the contract calls for 404.
      errors.throwIfAny();
      throw meetingTypeNotFound(parsed.meetingTypeId);
    }

    if (meetingType !== null && parsed.startAt !== null) {
      const violation = startAtViolation(
        parsed.startAt.toJSDate(),
        meetingType.durationMin,
        now,
      );
      if (violation !== null) {
        errors.add('startAt', violation);
      }
    }

    errors.throwIfAny();

    if (
      meetingType === null ||
      parsed.meetingTypeId === null ||
      parsed.startAt === null ||
      parsed.guestName === null ||
      parsed.guestEmail === null
    ) {
      // Unreachable once the required fields have passed validation.
      throw validationFailed(errors.toDetails().fields);
    }

    const start = parsed.startAt.toJSDate();
    const startAt = start.toISOString();
    const endAt = new Date(
      start.getTime() + meetingType.durationMin * 60_000,
    ).toISOString();

    const record = this.repository.create({
      meetingTypeId: parsed.meetingTypeId,
      startAt,
      endAt,
      guestName: parsed.guestName,
      guestEmail: parsed.guestEmail,
      comment: parsed.comment,
    });

    return { ...record, meetingType };
  }
}
