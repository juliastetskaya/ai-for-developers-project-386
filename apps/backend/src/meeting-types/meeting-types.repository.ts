import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type {
  CreateMeetingTypeInput,
  MeetingType,
} from './meeting-type.js';

interface MeetingTypeRow {
  id: number;
  name: string;
  description: string | null;
  durationMin: number;
  createdAt: string;
}

function toMeetingType(row: MeetingTypeRow): MeetingType {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    durationMin: row.durationMin,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class MeetingTypesRepository {
  constructor(private readonly database: DatabaseService) {}

  list(): MeetingType[] {
    const rows = this.database.db
      .prepare(
        `SELECT "id", "name", "description", "durationMin", "createdAt"
         FROM "MeetingType"
         ORDER BY "createdAt" ASC, "id" ASC`,
      )
      .all() as MeetingTypeRow[];

    return rows.map(toMeetingType);
  }

  create(input: CreateMeetingTypeInput): MeetingType {
    const createdAt = new Date().toISOString();
    const result = this.database.db
      .prepare(
        `INSERT INTO "MeetingType" ("name", "description", "durationMin", "createdAt")
         VALUES (?, ?, ?, ?)`,
      )
      .run(input.name, input.description, input.durationMin, createdAt);

    const row = this.database.db
      .prepare(
        `SELECT "id", "name", "description", "durationMin", "createdAt"
         FROM "MeetingType"
         WHERE "id" = ?`,
      )
      .get(Number(result.lastInsertRowid)) as MeetingTypeRow;

    return toMeetingType(row);
  }

  findById(id: number): MeetingType | null {
    const row = this.database.db
      .prepare(
        `SELECT "id", "name", "description", "durationMin", "createdAt"
         FROM "MeetingType"
         WHERE "id" = ?`,
      )
      .get(id) as MeetingTypeRow | undefined;

    return row === undefined ? null : toMeetingType(row);
  }
}
