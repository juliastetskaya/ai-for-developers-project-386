import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { BusyInterval } from '../slots/slots.js';

interface BookingIntervalRow {
  startAt: string;
  endAt: string;
}

/**
 * Reads the busy intervals that can affect one calendar day. Any booking of any
 * meeting type participates, because a time overlap blocks availability
 * globally.
 */
@Injectable()
export class AvailabilityRepository {
  constructor(private readonly database: DatabaseService) {}

  findOverlapping(startAt: string, endAt: string): BusyInterval[] {
    const rows = this.database.db
      .prepare(
        `SELECT "startAt", "endAt"
         FROM "Booking"
         WHERE "startAt" < ? AND "endAt" > ?`,
      )
      .all(endAt, startAt) as BookingIntervalRow[];

    return rows.map((row) => ({ startAt: row.startAt, endAt: row.endAt }));
  }
}
