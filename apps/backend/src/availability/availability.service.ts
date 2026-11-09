import { Injectable } from '@nestjs/common';
import {
  dateOutOfRange,
  meetingTypeNotFound,
  validationFailed,
} from '../common/api-error.js';
import {
  readInteger,
  readString,
  ValidationErrors,
} from '../common/validation.js';
import { MeetingTypesService } from '../meeting-types/meeting-types.service.js';
import {
  dayWindow,
  freeSlotsForDay,
  isCalendarDate,
  ownerHorizon,
  type TimeInterval,
} from '../slots/slots.js';
import { AvailabilityRepository } from './availability.repository.js';

export interface AvailabilityQuery {
  meetingTypeId: number;
  date: string;
}

/**
 * Validates `GET /availability` query parameters. A malformed or missing value
 * yields a `validation_failed` error with one entry per bad field.
 */
export function parseAvailabilityQuery(
  query: Record<string, unknown>,
): AvailabilityQuery {
  const errors = new ValidationErrors();

  const meetingTypeId = readInteger(query, 'meetingTypeId', errors, {
    required: true,
  });
  const date = readString(query, 'date', errors, { required: true });

  if (date !== null && !isCalendarDate(date)) {
    errors.add('date', 'Must be a valid date in YYYY-MM-DD format.');
  }

  errors.throwIfAny();

  if (meetingTypeId === null || date === null) {
    // Unreachable while both fields are required, but keeps the types honest.
    throw validationFailed(errors.toDetails().fields);
  }

  return { meetingTypeId, date };
}

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly meetingTypes: MeetingTypesService,
    private readonly repository: AvailabilityRepository,
  ) {}

  listFreeSlots(
    query: Record<string, unknown>,
    now: Date = new Date(),
  ): TimeInterval[] {
    const { meetingTypeId, date } = parseAvailabilityQuery(query);

    const meetingType = this.meetingTypes.find(meetingTypeId);
    if (meetingType === null) {
      throw meetingTypeNotFound(meetingTypeId);
    }

    const { earliestDate, latestDate } = ownerHorizon(now);
    if (date < earliestDate || date > latestDate) {
      throw dateOutOfRange(date, earliestDate, latestDate);
    }

    const window = dayWindow(date);
    const busy = this.repository.findOverlapping(window.startAt, window.endAt);

    return freeSlotsForDay({
      date,
      durationMin: meetingType.durationMin,
      busy,
      now,
    });
  }
}
