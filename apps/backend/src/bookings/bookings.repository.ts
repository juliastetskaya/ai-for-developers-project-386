import { Injectable, Logger } from '@nestjs/common';
import { ApiError, slotUnavailable } from '../common/api-error.js';
import { DatabaseService } from '../database/database.service.js';
import type { Booking, BookingRecord } from './booking.js';

export interface PersistBookingInput {
  meetingTypeId: number;
  startAt: string;
  endAt: string;
  guestName: string;
  guestEmail: string;
  comment: string | null;
}

interface BookingWithMeetingTypeRow extends BookingRecord {
  meetingTypeName: string;
  meetingTypeDescription: string | null;
  meetingTypeDurationMin: number;
  meetingTypeCreatedAt: string;
}

function toBooking(row: BookingWithMeetingTypeRow): Booking {
  return {
    id: row.id,
    meetingTypeId: row.meetingTypeId,
    meetingType: {
      id: row.meetingTypeId,
      name: row.meetingTypeName,
      description: row.meetingTypeDescription,
      durationMin: row.meetingTypeDurationMin,
      createdAt: row.meetingTypeCreatedAt,
    },
    startAt: row.startAt,
    endAt: row.endAt,
    guestName: row.guestName,
    guestEmail: row.guestEmail,
    comment: row.comment,
    createdAt: row.createdAt,
  };
}

/**
 * Creates bookings through the singleton better-sqlite3 connection.
 *
 * The overlap SELECT and the INSERT run inside a single `BEGIN IMMEDIATE`
 * transaction, so two concurrent requests for intersecting intervals can never
 * both commit: the loser observes the winner's row and throws the domain
 * `slot_unavailable` error. better-sqlite3 is synchronous, so transaction
 * bodies never interleave in-process; `.immediate()` also takes the write lock
 * up front, protecting against external writers in WAL mode.
 */
@Injectable()
export class BookingsRepository {
  private readonly logger = new Logger(BookingsRepository.name);

  constructor(private readonly database: DatabaseService) {}

  /**
   * Bookings starting at or after `now`, ascending by start. Both stored
   * timestamps are normalized UTC ISO-8601 strings, so the comparison is
   * lexicographic and matches chronological order.
   */
  listUpcoming(now: string): Booking[] {
    const rows = this.database.db
      .prepare(
        `SELECT b."id", b."meetingTypeId", b."startAt", b."endAt",
                b."guestName", b."guestEmail", b."comment", b."createdAt",
                m."name" AS "meetingTypeName",
                m."description" AS "meetingTypeDescription",
                m."durationMin" AS "meetingTypeDurationMin",
                m."createdAt" AS "meetingTypeCreatedAt"
         FROM "Booking" b
         JOIN "MeetingType" m ON m."id" = b."meetingTypeId"
         WHERE b."startAt" >= ?
         ORDER BY b."startAt" ASC, b."id" ASC`,
      )
      .all(now) as BookingWithMeetingTypeRow[];

    return rows.map(toBooking);
  }

  create(input: PersistBookingInput): BookingRecord {
    const db = this.database.db;
    const createdAt = new Date().toISOString();

    const findOverlap = db.prepare(
      `SELECT 1 FROM "Booking"
       WHERE "startAt" < ? AND "endAt" > ?
       LIMIT 1`,
    );
    const insert = db.prepare(
      `INSERT INTO "Booking"
         ("meetingTypeId", "startAt", "endAt", "guestName", "guestEmail", "comment", "createdAt")
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );

    const createBooking = db.transaction((): number => {
      if (findOverlap.get(input.endAt, input.startAt) !== undefined) {
        throw slotUnavailable();
      }

      const result = insert.run(
        input.meetingTypeId,
        input.startAt,
        input.endAt,
        input.guestName,
        input.guestEmail,
        input.comment,
        createdAt,
      );

      return Number(result.lastInsertRowid);
    });

    try {
      const id = createBooking.immediate();
      return { id, ...input, createdAt };
    } catch (error) {
      // Business conflicts keep their own API error. Anything else (for
      // example SQLITE_BUSY after the busy timeout) is logged here and mapped
      // to 500 internal_error by the global exception filter. No auto-retries.
      if (error instanceof ApiError) {
        throw error;
      }
      this.logger.error(
        'Failed to create a booking atomically',
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }
}
