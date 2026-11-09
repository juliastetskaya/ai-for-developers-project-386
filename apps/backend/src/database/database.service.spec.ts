import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseService } from './database.service.js';

describe('DatabaseService', () => {
  let directory: string;
  let service: DatabaseService;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'call-calendar-db-'));
    process.env.DATABASE_URL = `file:${join(directory, 'unit.db')}`;
    service = new DatabaseService();
  });

  afterEach(() => {
    service.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('opens a WAL connection with the required pragmas', () => {
    expect(service.db.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(service.db.pragma('busy_timeout', { simple: true })).toBe(5000);
    expect(service.db.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('applies the committed migration once', () => {
    const tables = service.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all()
      .map((row) => (row as { name: string }).name);

    expect(tables).toEqual(
      expect.arrayContaining(['Booking', 'MeetingType', '_migrations']),
    );
    expect(
      service.db.prepare('SELECT COUNT(*) AS count FROM _migrations').get(),
    ).toEqual({ count: 1 });
  });

  it('stores the booking end time explicitly', () => {
    const columns = (
      service.db.pragma('table_info(Booking)') as Array<{ name: string }>
    ).map((column) => column.name);

    expect(columns).toEqual(
      expect.arrayContaining([
        'startAt',
        'endAt',
        'meetingTypeId',
        'guestName',
        'guestEmail',
      ]),
    );
  });
});
