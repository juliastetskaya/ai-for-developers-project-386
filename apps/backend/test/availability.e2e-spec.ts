import type { INestApplication } from '@nestjs/common';
import { DateTime } from 'luxon';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DatabaseService } from '../src/database/database.service.js';
import { OWNER_TIMEZONE } from '../src/slots/slots.js';
import { createTestApp, type TestAppContext } from './test-app.js';

interface SlotBody {
  startAt: string;
  endAt: string;
}

interface MeetingTypeBody {
  id: number;
}

describe('Availability (e2e)', () => {
  let context: TestAppContext;
  let app: INestApplication<App>;
  let database: DatabaseService;
  let thirtyMinuteTypeId: number;
  let sixtyMinuteTypeId: number;

  const ownerNow = DateTime.utc().setZone(OWNER_TIMEZONE);
  const today = ownerNow.toISODate()!;
  const tomorrow = ownerNow.plus({ days: 1 }).toISODate()!;
  const dayAfterTomorrow = ownerNow.plus({ days: 2 }).toISODate()!;
  const latestDate = ownerNow.plus({ days: 13 }).toISODate()!;
  const yesterday = ownerNow.minus({ days: 1 }).toISODate()!;
  const beyondHorizon = ownerNow.plus({ days: 14 }).toISODate()!;

  beforeAll(async () => {
    context = await createTestApp();
    app = context.app;
    database = app.get(DatabaseService);

    const thirtyMinutes = await request(app.getHttpServer())
      .post('/meeting-types')
      .send({ name: 'Consultation', durationMin: 30 })
      .expect(201);
    thirtyMinuteTypeId = (thirtyMinutes.body as MeetingTypeBody).id;

    const sixtyMinutes = await request(app.getHttpServer())
      .post('/meeting-types')
      .send({ name: 'Deep dive', durationMin: 60 })
      .expect(201);
    sixtyMinuteTypeId = (sixtyMinutes.body as MeetingTypeBody).id;
  });

  afterAll(async () => {
    await context.cleanup();
  });

  beforeEach(() => {
    database.db.prepare('DELETE FROM "Booking"').run();
  });

  it('returns every free slot of a day as ISO UTC, ascending', async () => {
    const response = await request(app.getHttpServer())
      .get('/availability')
      .query({ meetingTypeId: thirtyMinuteTypeId, date: tomorrow })
      .expect(200);

    const slots = response.body as SlotBody[];

    expect(slots).toHaveLength(18);
    expect(slots[0]).toEqual({
      startAt: `${tomorrow}T06:00:00.000Z`, // 09:00 in Moscow
      endAt: `${tomorrow}T06:30:00.000Z`,
    });
    expect(slots.at(-1)).toEqual({
      startAt: `${tomorrow}T14:30:00.000Z`, // 17:30 in Moscow
      endAt: `${tomorrow}T15:00:00.000Z`, // 18:00 in Moscow
    });

    const starts = slots.map((slot) => slot.startAt);
    expect(starts).toEqual([...starts].sort());
  });

  it('returns 404 meeting_type_not_found with the meeting type id', async () => {
    const response = await request(app.getHttpServer())
      .get('/availability')
      .query({ meetingTypeId: 999_999, date: tomorrow })
      .expect(404);

    expect(response.body).toEqual({
      statusCode: 404,
      code: 'meeting_type_not_found',
      message: 'Meeting type not found',
      details: { meetingTypeId: 999_999 },
    });
  });

  it('rejects a date in the past with date_out_of_range', async () => {
    const response = await request(app.getHttpServer())
      .get('/availability')
      .query({ meetingTypeId: thirtyMinuteTypeId, date: yesterday })
      .expect(400);

    expect(response.body).toEqual({
      statusCode: 400,
      code: 'date_out_of_range',
      message: 'Date is outside the booking horizon',
      details: {
        date: yesterday,
        earliestDate: today,
        latestDate,
      },
    });
  });

  it('rejects a date beyond the 14-day horizon with date_out_of_range', async () => {
    const response = await request(app.getHttpServer())
      .get('/availability')
      .query({ meetingTypeId: thirtyMinuteTypeId, date: beyondHorizon })
      .expect(400);

    expect(response.body).toEqual({
      statusCode: 400,
      code: 'date_out_of_range',
      message: 'Date is outside the booking horizon',
      details: {
        date: beyondHorizon,
        earliestDate: today,
        latestDate,
      },
    });
  });

  it('accepts the last day of the horizon', async () => {
    const response = await request(app.getHttpServer())
      .get('/availability')
      .query({ meetingTypeId: thirtyMinuteTypeId, date: latestDate })
      .expect(200);

    expect(response.body).toHaveLength(18);
  });

  it('rejects missing query parameters with field errors', async () => {
    const response = await request(app.getHttpServer())
      .get('/availability')
      .expect(400);

    expect(response.body).toEqual({
      statusCode: 400,
      code: 'validation_failed',
      message: 'Request validation failed',
      details: {
        fields: [
          { field: 'meetingTypeId', message: 'This field is required.' },
          { field: 'date', message: 'This field is required.' },
        ],
      },
    });
  });

  it('rejects invalid query parameter formats with field errors', async () => {
    const response = await request(app.getHttpServer())
      .get('/availability')
      .query({ meetingTypeId: 'abc', date: '2026-02-30' })
      .expect(400);

    expect(response.body).toEqual({
      statusCode: 400,
      code: 'validation_failed',
      message: 'Request validation failed',
      details: {
        fields: [
          { field: 'meetingTypeId', message: 'Must be an integer.' },
          {
            field: 'date',
            message: 'Must be a valid date in YYYY-MM-DD format.',
          },
        ],
      },
    });
  });

  it('excludes slots that overlap a booking of another meeting type', async () => {
    // 10:00-10:30 in Moscow, booked under the 60-minute meeting type.
    insertBooking({
      meetingTypeId: sixtyMinuteTypeId,
      startAt: `${dayAfterTomorrow}T07:00:00.000Z`,
      endAt: `${dayAfterTomorrow}T07:30:00.000Z`,
    });

    const response = await request(app.getHttpServer())
      .get('/availability')
      .query({ meetingTypeId: thirtyMinuteTypeId, date: dayAfterTomorrow })
      .expect(200);

    const starts = (response.body as SlotBody[]).map((slot) => slot.startAt);

    expect(starts).toHaveLength(17);
    expect(starts).not.toContain(`${dayAfterTomorrow}T07:00:00.000Z`); // 10:00 is blocked
    expect(starts).toContain(`${dayAfterTomorrow}T06:30:00.000Z`); // 09:30 ends at 10:00
    expect(starts).toContain(`${dayAfterTomorrow}T07:30:00.000Z`); // 10:30 starts at 10:30
  });

  it('does not count a booking that only touches the slot boundary', async () => {
    // 09:00-09:30 in Moscow: only the touching 09:30 slot must stay free.
    insertBooking({
      meetingTypeId: sixtyMinuteTypeId,
      startAt: `${dayAfterTomorrow}T06:00:00.000Z`,
      endAt: `${dayAfterTomorrow}T06:30:00.000Z`,
    });

    const response = await request(app.getHttpServer())
      .get('/availability')
      .query({ meetingTypeId: thirtyMinuteTypeId, date: dayAfterTomorrow })
      .expect(200);

    const starts = (response.body as SlotBody[]).map((slot) => slot.startAt);

    expect(starts).toHaveLength(17);
    expect(starts).not.toContain(`${dayAfterTomorrow}T06:00:00.000Z`); // 09:00 is blocked
    expect(starts).toContain(`${dayAfterTomorrow}T06:30:00.000Z`); // 09:30 touches only
  });

  function insertBooking(input: {
    meetingTypeId: number;
    startAt: string;
    endAt: string;
  }): void {
    database.db
      .prepare(
        `INSERT INTO "Booking"
           ("meetingTypeId", "startAt", "endAt", "guestName", "guestEmail", "comment", "createdAt")
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.meetingTypeId,
        input.startAt,
        input.endAt,
        'Test Guest',
        'guest@example.com',
        null,
        new Date().toISOString(),
      );
  }
});
