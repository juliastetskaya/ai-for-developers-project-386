import type { INestApplication } from '@nestjs/common';
import { Controller, Get, MethodNotAllowedException } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createTestApp, type TestAppContext } from './test-app.js';
import { slotUnavailable, validationFailed } from '../src/common/api-error.js';

/**
 * Test-only controller used to provoke errors without putting deliberately
 * broken routes into production code.
 */
@Controller('__test__')
class ExplodingController {
  @Get('boom')
  boom(): never {
    throw new Error('internal-secret-do-not-leak');
  }

  @Get('validation')
  validation(): never {
    throw validationFailed([
      { field: 'name', message: 'This field is required.' },
    ]);
  }

  @Get('conflict')
  conflict(): never {
    throw slotUnavailable();
  }

  @Get('method-not-allowed')
  methodNotAllowed(): never {
    throw new MethodNotAllowedException();
  }
}

describe('API foundation (e2e)', () => {
  let context: TestAppContext;
  let app: INestApplication<App>;

  beforeAll(async () => {
    context = await createTestApp([ExplodingController]);
    app = context.app;
  });

  afterAll(async () => {
    await context.cleanup();
  });

  it('GET /health reports ok', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body).toEqual({ status: 'ok' });
  });

  it('unknown routes return the not_found envelope', async () => {
    const response = await request(app.getHttpServer())
      .get('/no-such-route')
      .expect(404);

    expect(response.body).toEqual({
      statusCode: 404,
      code: 'not_found',
      message: 'Route not found',
    });
  });

  it('unexpected errors return a sanitized internal_error envelope', async () => {
    const response = await request(app.getHttpServer())
      .get('/__test__/boom')
      .expect(500);

    expect(response.body).toEqual({
      statusCode: 500,
      code: 'internal_error',
      message: 'Internal server error',
    });
    expect(JSON.stringify(response.body)).not.toContain(
      'internal-secret-do-not-leak',
    );
  });

  it('malformed JSON returns validation_failed', async () => {
    const response = await request(app.getHttpServer())
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      statusCode: 400,
      code: 'validation_failed',
      message: 'Request validation failed',
      details: { fields: [] },
    });
  });

  it('maps framework 4xx errors other than 400/404 to request_error', async () => {
    const response = await request(app.getHttpServer())
      .get('/__test__/method-not-allowed')
      .expect(405);

    expect(response.body).toEqual({
      statusCode: 405,
      code: 'request_error',
      message: 'Request could not be processed',
    });
  });

  it('business validation errors keep their field details', async () => {
    const response = await request(app.getHttpServer())
      .get('/__test__/validation')
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

  it('business errors without details omit the details key', async () => {
    const response = await request(app.getHttpServer())
      .get('/__test__/conflict')
      .expect(409);

    expect(response.body).toEqual({
      statusCode: 409,
      code: 'slot_unavailable',
      message: 'The selected slot is no longer available',
    });
  });
});
