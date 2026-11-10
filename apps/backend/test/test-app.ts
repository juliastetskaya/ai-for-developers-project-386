import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';

export interface TestAppContext {
  app: INestApplication<App>;
  databaseUrl: string;
  cleanup: () => Promise<void>;
}

export interface TestAppOptions {
  /**
   * Extra middleware registered before `init`, e.g. `configureStaticFrontend`.
   * Must run before init to mirror `main.ts`, where the SPA fallback is
   * registered ahead of Nest's own not-found handler.
   */
  configure?: (app: NestExpressApplication) => void;
}

/**
 * Boots the real application against a throwaway SQLite file.
 *
 * DATABASE_URL must point at the fresh file before the testing module is
 * created: DatabaseService applies the committed migrations when it is
 * instantiated. The whole temp directory (including -wal/-shm side files) is
 * removed after the app closes.
 */
export async function createTestApp(
  controllers: Type[] = [],
  options: TestAppOptions = {},
): Promise<TestAppContext> {
  const directory = mkdtempSync(join(tmpdir(), 'call-calendar-e2e-'));
  const databaseUrl = `file:${join(directory, 'test.db')}`;
  process.env.DATABASE_URL = databaseUrl;

  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
    controllers,
  }).compile();

  const app = moduleFixture.createNestApplication<NestExpressApplication>();
  configureApp(app);
  options.configure?.(app);
  await app.init();

  return {
    app,
    databaseUrl,
    async cleanup() {
      await app.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
