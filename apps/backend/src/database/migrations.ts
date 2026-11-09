import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import Database from 'better-sqlite3';

const MIGRATIONS_DIRECTORY = join(process.cwd(), 'prisma', 'migrations');
const MIGRATIONS_TABLE = '_migrations';

/**
 * Strips the `file:` scheme and resolves relative paths against the backend
 * package directory (the working directory for dev, tests and `node dist/main`).
 */
export function resolveDatabasePath(databaseUrl: string): string {
  const path = databaseUrl.startsWith('file:')
    ? databaseUrl.slice('file:'.length)
    : databaseUrl;

  if (path === ':memory:') {
    return path;
  }

  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

/**
 * Applies every committed `prisma/migrations/<name>/migration.sql` in filename
 * order, recording each name in `_migrations`. Prisma is used only to author
 * these files; the runtime never imports Prisma Client.
 */
export function applyMigrations(
  db: Database.Database,
  migrationsDirectory = MIGRATIONS_DIRECTORY,
): void {
  if (!existsSync(migrationsDirectory)) {
    throw new Error(`Migrations directory not found: ${migrationsDirectory}`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (
      "name" TEXT NOT NULL PRIMARY KEY,
      "applied_at" TEXT NOT NULL
    )
  `);

  const applied = new Set(
    db
      .prepare(`SELECT "name" FROM "${MIGRATIONS_TABLE}"`)
      .all()
      .map((row) => (row as { name: string }).name),
  );

  const recordMigration = db.prepare(
    `INSERT INTO "${MIGRATIONS_TABLE}" ("name", "applied_at") VALUES (?, ?)`,
  );

  const migrationNames = readdirSync(migrationsDirectory, {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const name of migrationNames) {
    const migrationFile = join(migrationsDirectory, name, 'migration.sql');
    if (!existsSync(migrationFile) || applied.has(name)) {
      continue;
    }

    const sql = readFileSync(migrationFile, 'utf8');
    db.transaction(() => {
      db.exec(sql);
      recordMigration.run(name, new Date().toISOString());
    }).immediate();
  }
}
