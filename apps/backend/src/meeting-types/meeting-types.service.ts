import { Injectable } from '@nestjs/common';
import { validationFailed } from '../common/api-error.js';
import {
  asRecord,
  readInteger,
  readString,
  ValidationErrors,
} from '../common/validation.js';
import type {
  CreateMeetingTypeInput,
  MeetingType,
} from './meeting-type.js';
import { MeetingTypesRepository } from './meeting-types.repository.js';

export const MEETING_TYPE_NAME_MAX_LENGTH = 100;
export const MEETING_TYPE_DESCRIPTION_MAX_LENGTH = 500;
export const MEETING_TYPE_DURATION_MIN = 5;
export const MEETING_TYPE_DURATION_MAX = 240;

/**
 * Validates a `POST /meeting-types` body and normalizes it for storage.
 * Every invalid field produces exactly one entry in `details.fields`.
 */
export function parseCreateMeetingType(body: unknown): CreateMeetingTypeInput {
  const errors = new ValidationErrors();
  const record = asRecord(body) ?? {};

  const name = readString(record, 'name', errors, { required: true });
  if (name !== null && name.length > MEETING_TYPE_NAME_MAX_LENGTH) {
    errors.add(
      'name',
      `Must be at most ${MEETING_TYPE_NAME_MAX_LENGTH} characters.`,
    );
  }

  const description = readString(record, 'description', errors);
  if (
    description !== null &&
    description.length > MEETING_TYPE_DESCRIPTION_MAX_LENGTH
  ) {
    errors.add(
      'description',
      `Must be at most ${MEETING_TYPE_DESCRIPTION_MAX_LENGTH} characters.`,
    );
  }

  const durationMin = readInteger(record, 'durationMin', errors, {
    required: true,
  });
  if (
    durationMin !== null &&
    (durationMin < MEETING_TYPE_DURATION_MIN ||
      durationMin > MEETING_TYPE_DURATION_MAX)
  ) {
    errors.add(
      'durationMin',
      `Must be between ${MEETING_TYPE_DURATION_MIN} and ${MEETING_TYPE_DURATION_MAX} minutes.`,
    );
  }

  errors.throwIfAny();

  if (name === null || durationMin === null) {
    // Unreachable while both fields are required, but keeps the types honest.
    throw validationFailed(errors.toDetails().fields);
  }

  return {
    name,
    description: description === '' ? null : description,
    durationMin,
  };
}

@Injectable()
export class MeetingTypesService {
  constructor(private readonly repository: MeetingTypesRepository) {}

  list(): MeetingType[] {
    return this.repository.list();
  }

  create(body: unknown): MeetingType {
    return this.repository.create(parseCreateMeetingType(body));
  }
}
