import type { MeetingType } from '../meeting-types/meeting-type.js';

/** A persisted booking together with the meeting type it belongs to. */
export interface Booking {
  id: number;
  meetingTypeId: number;
  meetingType: MeetingType;
  /** UTC ISO-8601 timestamp. */
  startAt: string;
  /** UTC ISO-8601 timestamp, computed as `startAt + durationMin`. */
  endAt: string;
  guestName: string;
  guestEmail: string;
  comment: string | null;
  /** UTC ISO-8601 timestamp. */
  createdAt: string;
}

/** The booking columns as stored in SQLite, without the joined meeting type. */
export type BookingRecord = Omit<Booking, 'meetingType'>;
