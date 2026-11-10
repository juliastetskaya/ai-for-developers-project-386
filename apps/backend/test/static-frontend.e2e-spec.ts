import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { configureStaticFrontend } from '../src/static-frontend.js';
import { createTestApp, type TestAppContext } from './test-app.js';

const SPA_SHELL = '<!doctype html><html><body>spa shell</body></html>';

/** Creates a fake `vite build` output: an index.html plus one hashed asset. */
function createFrontendDist(): string {
  const directory = mkdtempSync(join(tmpdir(), 'call-calendar-spa-'));
  writeFileSync(join(directory, 'index.html'), SPA_SHELL);
  mkdirSync(join(directory, 'assets'));
  writeFileSync(join(directory, 'assets', 'app.js'), 'console.log("spa")');
  return directory;
}

describe('SPA served by the backend (e2e)', () => {
  let context: TestAppContext;
  let frontendDist: string;

  beforeAll(async () => {
    frontendDist = createFrontendDist();

    context = await createTestApp([], {
      configure: (app) => {
        expect(configureStaticFrontend(app, frontendDist)).toBe(true);
      },
    });
  });

  afterAll(async () => {
    await context.cleanup();
    rmSync(frontendDist, { recursive: true, force: true });
  });

  it('returns the SPA shell for the root route', async () => {
    const response = await request(context.app.getHttpServer()).get('/');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toBe(SPA_SHELL);
  });

  it('falls back to index.html for client-side routes', async () => {
    for (const path of ['/book', '/admin']) {
      const response = await request(context.app.getHttpServer()).get(path);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toBe(SPA_SHELL);
    }
  });

  it('serves built assets from disk', async () => {
    const response = await request(context.app.getHttpServer()).get(
      '/assets/app.js',
    );

    expect(response.status).toBe(200);
    expect(response.text).toBe('console.log("spa")');
  });

  it('does not mask missing assets with the SPA shell', async () => {
    const response = await request(context.app.getHttpServer()).get(
      '/assets/missing.js',
    );

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).not.toContain('text/html');
  });

  it('keeps API routes on the JSON envelopes', async () => {
    const health = await request(context.app.getHttpServer()).get('/health');
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ status: 'ok' });

    const meetingTypes = await request(context.app.getHttpServer()).get(
      '/meeting-types',
    );
    expect(meetingTypes.status).toBe(200);
    expect(meetingTypes.body).toEqual([]);
  });

  it('keeps API 404s as JSON instead of returning the SPA shell', async () => {
    const response = await request(context.app.getHttpServer()).get(
      '/meeting-types/999',
    );

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.body).toMatchObject({
      statusCode: 404,
      code: 'not_found',
    });
  });

  it('does not fall back for non-GET requests', async () => {
    const response = await request(context.app.getHttpServer()).post(
      '/unknown-route',
    );

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toContain('application/json');
  });
});

describe('API without a frontend build (e2e)', () => {
  let context: TestAppContext;
  let missingDist: string;

  beforeAll(async () => {
    const directory = mkdtempSync(join(tmpdir(), 'call-calendar-nodist-'));
    missingDist = join(directory, 'dist');
    context = await createTestApp([], {
      configure: (app) => {
        expect(configureStaticFrontend(app, missingDist)).toBe(false);
      },
    });
    rmSync(directory, { recursive: true, force: true });
  });

  afterAll(async () => {
    await context.cleanup();
  });

  it('serves the API and answers unknown routes with JSON 404', async () => {
    const health = await request(
      context.app.getHttpServer(),
    ).get('/health');
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ status: 'ok' });

    const unknown = await request(context.app.getHttpServer()).get('/');
    expect(unknown.status).toBe(404);
    expect(unknown.headers['content-type']).toContain('application/json');
  });
});
