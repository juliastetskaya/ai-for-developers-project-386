import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createTestApp, type TestAppContext } from './test-app.js';

interface MeetingTypeBody {
  id: number;
  name: string;
  description: string | null;
  durationMin: number;
  createdAt: string;
}

describe('Meeting types (e2e)', () => {
  let context: TestAppContext;
  let app: INestApplication<App>;

  beforeAll(async () => {
    context = await createTestApp();
    app = context.app;
  });

  afterAll(async () => {
    await context.cleanup();
  });

  it('creates a meeting type and returns the created resource', async () => {
    const response = await request(app.getHttpServer())
      .post('/meeting-types')
      .send({
        name: '  Intro call  ',
        description: '  A short introductory call  ',
        durationMin: 15,
      })
      .expect(201);

    const body = response.body as MeetingTypeBody;

    expect(body).toMatchObject({
      id: expect.any(Number),
      name: 'Intro call',
      description: 'A short introductory call',
      durationMin: 15,
      createdAt: expect.any(String),
    });
    expect(new Date(body.createdAt).toISOString()).toBe(body.createdAt);
  });

  it('creates a meeting type without a description', async () => {
    const response = await request(app.getHttpServer())
      .post('/meeting-types')
      .send({ name: 'Quick sync', durationMin: 30 })
      .expect(201);

    expect(response.body).toMatchObject({
      name: 'Quick sync',
      description: null,
      durationMin: 30,
    });
  });

  it('lists meeting types in creation order', async () => {
    const first = await request(app.getHttpServer())
      .post('/meeting-types')
      .send({ name: 'First listed', durationMin: 20 })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post('/meeting-types')
      .send({ name: 'Second listed', durationMin: 45 })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/meeting-types')
      .expect(200);

    const names = (response.body as MeetingTypeBody[]).map((item) => item.name);
    const ids = (response.body as MeetingTypeBody[]).map((item) => item.id);

    expect(names).toContain('First listed');
    expect(names).toContain('Second listed');
    expect(names.indexOf('First listed')).toBeLessThan(
      names.indexOf('Second listed'),
    );
    expect(ids.indexOf(first.body.id as number)).toBeLessThan(
      ids.indexOf(second.body.id as number),
    );
  });

  it('rejects a blank name with a field error', async () => {
    const response = await request(app.getHttpServer())
      .post('/meeting-types')
      .send({ name: '   ', durationMin: 30 })
      .expect(400);

    expect(response.body).toEqual({
      statusCode: 400,
      code: 'validation_failed',
      message: 'Request validation failed',
      details: {
        fields: [{ field: 'name', message: 'This field is required.' }],
      },
    });
  });

  it('rejects a name longer than 100 characters', async () => {
    const response = await request(app.getHttpServer())
      .post('/meeting-types')
      .send({ name: 'x'.repeat(101), durationMin: 30 })
      .expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      code: 'validation_failed',
      message: 'Request validation failed',
    });
    expect(response.body.details.fields).toEqual([
      { field: 'name', message: 'Must be at most 100 characters.' },
    ]);
  });

  it('rejects a description longer than 500 characters', async () => {
    const response = await request(app.getHttpServer())
      .post('/meeting-types')
      .send({ name: 'Long description', description: 'd'.repeat(501), durationMin: 30 })
      .expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      code: 'validation_failed',
      message: 'Request validation failed',
    });
    expect(response.body.details.fields).toEqual([
      { field: 'description', message: 'Must be at most 500 characters.' },
    ]);
  });

  it.each([4, 241])(
    'rejects a duration of %i minutes',
    async (durationMin) => {
      const response = await request(app.getHttpServer())
        .post('/meeting-types')
        .send({ name: 'Out of range', durationMin })
        .expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        code: 'validation_failed',
        message: 'Request validation failed',
      });
      expect(response.body.details.fields).toEqual([
        { field: 'durationMin', message: 'Must be between 5 and 240 minutes.' },
      ]);
    },
  );

  it('reports one field error per invalid field', async () => {
    const response = await request(app.getHttpServer())
      .post('/meeting-types')
      .send({ name: '', durationMin: 300 })
      .expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      code: 'validation_failed',
      message: 'Request validation failed',
    });
    expect(response.body.details.fields).toEqual([
      { field: 'name', message: 'This field is required.' },
      {
        field: 'durationMin',
        message: 'Must be between 5 and 240 minutes.',
      },
    ]);
  });

  it('rejects a non-integer duration', async () => {
    const response = await request(app.getHttpServer())
      .post('/meeting-types')
      .send({ name: 'Half hour', durationMin: 30.5 })
      .expect(400);

    expect(response.body.details.fields).toEqual([
      { field: 'durationMin', message: 'Must be an integer.' },
    ]);
  });
});
