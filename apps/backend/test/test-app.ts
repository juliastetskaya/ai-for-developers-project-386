import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';

export interface TestAppContext {
  app: INestApplication<App>;
  databaseUrl: string;
  cleanup: () => Promise<void>;
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
): Promise<TestAppContext> {
  const directory = mkdtempSync(join(tmpdir(), 'call-calendar-e2e-'));
  const databaseUrl = `file:${join(directory, 'test.db')}`;
  process.env.DATABASE_URL = databaseUrl;

  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
    controllers,
  }).compile();

  const app = moduleFixture.createNestApplication();
  configureApp(app);
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
