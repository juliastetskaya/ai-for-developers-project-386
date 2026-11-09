import type { INestApplication } from '@nestjs/common';
import { DateTime } from 'luxon';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DatabaseService } from '../src/database/database.service.js';
import { OWNER_TIMEZONE } from '../src/slots/slots.js';
import { createTestApp, type TestAppContext } from './test-app.js';

interface MeetingTypeBody {
  id: number;
}

interface BookingBody {
  id: number;
  meetingTypeId: number;
  meetingType: {
    id: number;
    name: string;
    description: string | null;
    durationMin: number;
    createdAt: string;
  };
  startAt: string;
  endAt: string;
  guestName: string;
  guestEmail: string;
  comment: string | null;
  createdAt: string;
}

interface SlotBody {
  startAt: string;
}

const ownerNow = DateTime.now().setZone(OWNER_TIMEZONE);
const tomorrow = ownerNow.plus({ days: 1 }).toISODate()!;
const yesterday = ownerNow.minus({ days: 1 }).toISODate()!;
const beyondHorizon = ownerNow.plus({ days: 14 }).toISODate()!;

/** A UTC ISO-8601 instant for a wall-clock time in the owner timezone. */
function ownerTimeIso(date: string, hour: number, minute = 0): string {
  const instant = DateTime.fromISO(date, { zone: OWNER_TIMEZONE })
    .set({ hour, minute, second: 0, millisecond: 0 })
    .toUTC();

  return new Date(instant.toMillis()).toISOString();
}

describe('Bookings (e2e)', () => {
  let context: TestAppContext;
  let app: INestApplication<App>;
  let database: DatabaseService;
  let thirtyMinuteTypeId: number;
  let sixtyMinuteTypeId: number;

  beforeAll(async () => {
    context = await createTestApp();
    app = context.app;
    database = app.get(DatabaseService);

    const thirtyMinutes = await request(app.getHttpServer())
      .post('/meeting-types')
      .send({ name: 'Intro call', description: 'A short chat.', durationMin: 30 })
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

  function validPayload(overrides: Record<string, unknown> = {}) {
    return {
      meetingTypeId: thirtyMinuteTypeId,
      startAt: ownerTimeIso(tomorrow, 9),
      guestName: 'Ada Lovelace',
      guestEmail: 'ada@example.com',
      ...overrides,
    };
  }

  function postBooking(body: Record<string, unknown>) {
    return request(app.getHttpServer()).post('/bookings').send(body);
  }

  it('creates a booking with a computed end, UTC timestamps and a nested meeting type', async () => {
    const response = await postBooking(
      validPayload({
        guestName: '  Ada Lovelace  ',
        guestEmail: '  ada@example.com  ',
        comment: '  Please call me on my mobile.  ',
      }),
    ).expect(201);

    const body = response.body as BookingBody;
    const expectedStart = ownerTimeIso(tomorrow, 9);
    const expectedEnd = ownerTimeIso(tomorrow, 9, 30);

    expect(body).toMatchObject({
      id: expect.any(Number),
      meetingTypeId: thirtyMinuteTypeId,
      startAt: expectedStart,
      endAt: expectedEnd,
      guestName: 'Ada Lovelace',
      guestEmail: 'ada@example.com',
      comment: 'Please call me on my mobile.',
      meetingType: {
        id: thirtyMinuteTypeId,
        name: 'Intro call',
        description: 'A short chat.',
        durationMin: 30,
      },
    });
    expect(body.createdAt).toBe(new Date(body.createdAt).toISOString());
    expect(body.startAt).toBe(new Date(body.startAt).toISOString());
    expect(body.endAt).toBe(new Date(body.endAt).toISOString());
  });

  it('stores a blank comment as null', async () => {
    const response = await postBooking(validPayload({ comment: '   ' })).expect(
      201,
    );

    expect((response.body as BookingBody).comment).toBeNull();
  });

  it('rejects an empty guest name', async () => {
    const response = await postBooking(validPayload({ guestName: '   ' })).expect(
      400,
    );

    expect(response.body).toMatchObject({
      statusCode: 400,
      code: 'validation_failed',
      message: 'Request validation failed',
    });
    expect(response.body.details.fields).toEqual([
      { field: 'guestName', message: 'This field is required.' },
    ]);
  });

  it('rejects a guest name longer than 100 characters', async () => {
    const response = await postBooking(
      validPayload({ guestName: 'x'.repeat(101) }),
    ).expect(400);

    expect(response.body.details.fields).toEqual([
      { field: 'guestName', message: 'Must be at most 100 characters.' },
    ]);
  });

  it('rejects an invalid guest email', async () => {
    const response = await postBooking(
      validPayload({ guestEmail: 'not-an-email' }),
    ).expect(400);

    expect(response.body.details.fields).toEqual([
      { field: 'guestEmail', message: 'Must be a valid email address.' },
    ]);
  });

  it('rejects a comment longer than 2000 characters', async () => {
    const response = await postBooking(
      validPayload({ comment: 'c'.repeat(2001) }),
    ).expect(400);

    expect(response.body.details.fields).toEqual([
      { field: 'comment', message: 'Must be at most 2000 characters.' },
    ]);
  });

  it('rejects an unparseable startAt', async () => {
    const response = await postBooking(
      validPayload({ startAt: 'not-a-date' }),
    ).expect(400);

    expect(response.body.details.fields).toEqual([
      {
        field: 'startAt',
        message: 'Must be a valid ISO-8601 timestamp with an offset or Z.',
      },
    ]);
  });

  it('rejects a startAt without an explicit offset', async () => {
    const response = await postBooking(
      validPayload({ startAt: `${tomorrow}T09:00:00` }),
    ).expect(400);

    expect(response.body.details.fields).toEqual([
      {
        field: 'startAt',
        message: 'Must be a valid ISO-8601 timestamp with an offset or Z.',
      },
    ]);
  });

  it('rejects a startAt in the past', async () => {
    const response = await postBooking(
      validPayload({ startAt: ownerTimeIso(yesterday, 10) }),
    ).expect(400);

    expect(response.body.details.fields).toEqual([
      { field: 'startAt', message: 'Must be in the future.' },
    ]);
  });

  it('rejects a startAt outside the 14-day horizon', async () => {
    const response = await postBooking(
      validPayload({ startAt: ownerTimeIso(beyondHorizon, 9) }),
    ).expect(400);

    expect(response.body.details.fields).toEqual([
      { field: 'startAt', message: 'Must be within the next 14 days.' },
    ]);
  });

  it('rejects a startAt before the working window opens', async () => {
    const response = await postBooking(
      validPayload({ startAt: ownerTimeIso(tomorrow, 8) }),
    ).expect(400);

    expect(response.body.details.fields).toEqual([
      {
        field: 'startAt',
        message:
          'Must be within the working window (09:00–18:00 Europe/Moscow).',
      },
    ]);
  });

  it('rejects a startAt whose end crosses the working window close', async () => {
    const response = await postBooking(
      validPayload({
        meetingTypeId: sixtyMinuteTypeId,
        startAt: ownerTimeIso(tomorrow, 17, 30),
      }),
    ).expect(400);

    expect(response.body.details.fields).toEqual([
      {
        field: 'startAt',
        message:
          'Must be within the working window (09:00–18:00 Europe/Moscow).',
      },
    ]);
  });

  it('rejects a startAt that is not aligned to the slot grid', async () => {
    const response = await postBooking(
      validPayload({ startAt: ownerTimeIso(tomorrow, 9, 10) }),
    ).expect(400);

    expect(response.body.details.fields).toEqual([
      { field: 'startAt', message: 'Must align with a valid slot start.' },
    ]);
  });

  it('reports exactly one error per invalid field', async () => {
    const response = await postBooking({
      meetingTypeId: thirtyMinuteTypeId,
      startAt: ownerTimeIso(yesterday, 10),
      guestName: '',
      guestEmail: 'not-an-email',
      comment: 'c'.repeat(2001),
    }).expect(400);

    const fields = (
      response.body.details.fields as Array<{ field: string }>
    ).map((error) => error.field);

    expect(fields).toHaveLength(4);
    expect(new Set(fields)).toEqual(
      new Set(['guestName', 'guestEmail', 'comment', 'startAt']),
    );
  });

  it('returns 404 meeting_type_not_found for an unknown meeting type', async () => {
    const response = await postBooking(
      validPayload({ meetingTypeId: 999_999 }),
    ).expect(404);

    expect(response.body).toEqual({
      statusCode: 404,
      code: 'meeting_type_not_found',
      message: 'Meeting type not found',
      details: { meetingTypeId: 999_999 },
    });
  });

  it('returns 409 slot_unavailable when the interval overlaps a booking of another type', async () => {
    await postBooking(validPayload()).expect(201);

    const response = await postBooking(
      validPayload({ meetingTypeId: sixtyMinuteTypeId }),
    ).expect(409);

    expect(response.body).toEqual({
      statusCode: 409,
      code: 'slot_unavailable',
      message: 'The selected slot is no longer available',
    });
  });

  it('allows a booking that only touches the boundary of an existing one', async () => {
    await postBooking(validPayload()).expect(201);

    const response = await postBooking(
      validPayload({ startAt: ownerTimeIso(tomorrow, 9, 30) }),
    ).expect(201);

    expect((response.body as BookingBody).startAt).toBe(
      ownerTimeIso(tomorrow, 9, 30),
    );
  });

  it('lets exactly one of two parallel overlapping requests win', async () => {
    const startAt = ownerTimeIso(tomorrow, 10);

    const [first, second] = await Promise.all([
      postBooking(
        validPayload({
          meetingTypeId: thirtyMinuteTypeId,
          startAt,
          guestName: 'First Guest',
          guestEmail: 'first@example.com',
        }),
      ),
      postBooking(
        validPayload({
          meetingTypeId: sixtyMinuteTypeId,
          startAt,
          guestName: 'Second Guest',
          guestEmail: 'second@example.com',
        }),
      ),
    ]);

    const statuses = [first.status, second.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);

    const conflict = first.status === 409 ? first : second;
    expect(conflict.body).toEqual({
      statusCode: 409,
      code: 'slot_unavailable',
      message: 'The selected slot is no longer available',
    });
  });

  it('removes the booked interval from the availability of that day', async () => {
    await postBooking(validPayload()).expect(201);

    const response = await request(app.getHttpServer())
      .get('/availability')
      .query({ meetingTypeId: thirtyMinuteTypeId, date: tomorrow })
      .expect(200);

    const starts = (response.body as SlotBody[]).map((slot) => slot.startAt);

    expect(starts).not.toContain(ownerTimeIso(tomorrow, 9));
    expect(starts).toContain(ownerTimeIso(tomorrow, 9, 30));
  });
});
