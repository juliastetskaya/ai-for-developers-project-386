import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { OnModuleDestroy } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import Database from 'better-sqlite3';
import { applyMigrations, resolveDatabasePath } from './migrations.js';

export const DEFAULT_DATABASE_URL = 'file:./data/dev.db';

/**
 * Owns the single better-sqlite3 connection used by the whole backend.
 *
 * WAL + `busy_timeout=5000` + foreign keys are enabled once at startup; the
 * committed Prisma-authored migrations are applied before the connection is
 * exposed to repositories.
 */
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private closed = false;
  readonly db: Database.Database;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
    const databasePath = resolveDatabasePath(databaseUrl);

    if (databasePath !== ':memory:') {
      mkdirSync(dirname(databasePath), { recursive: true });
    }

    this.db = new Database(databasePath, { timeout: 5000 });

    try {
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('busy_timeout = 5000');
      this.db.pragma('foreign_keys = ON');
      applyMigrations(this.db);
      this.logger.log(`SQLite ready at ${databasePath}`);
    } catch (error) {
      this.db.close();
      this.closed = true;
      throw error;
    }
  }

  onModuleDestroy(): void {
    this.close();
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.db.close();
    this.closed = true;
  }
}
