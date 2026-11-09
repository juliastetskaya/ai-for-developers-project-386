import { ERROR_CODES, type ErrorCode } from './error-codes.js';

export interface FieldError {
  field: string;
  message: string;
}

export interface ValidationErrorDetails {
  fields: FieldError[];
}

export interface MeetingTypeNotFoundDetails {
  meetingTypeId: number;
}

export interface DateOutOfRangeDetails {
  /** Calendar date in the owner timezone, formatted as YYYY-MM-DD. */
  date: string;
  /** Earliest bookable calendar date, formatted as YYYY-MM-DD. */
  earliestDate: string;
  /** Latest bookable calendar date, formatted as YYYY-MM-DD. */
  latestDate: string;
}

export type ApiErrorDetails =
  ValidationErrorDetails | MeetingTypeNotFoundDetails | DateOutOfRangeDetails;

/**
 * A business error that already knows its HTTP status, machine-readable code
 * and (optionally) the exact `details` object the API contract promises.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details?: ApiErrorDetails;

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    details?: ApiErrorDetails,
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function validationFailed(
  fields: FieldError[],
  message = 'Request validation failed',
): ApiError {
  return new ApiError(400, ERROR_CODES.VALIDATION_FAILED, message, { fields });
}

export function slotUnavailable(
  message = 'The selected slot is no longer available',
): ApiError {
  return new ApiError(409, ERROR_CODES.SLOT_UNAVAILABLE, message);
}

export function meetingTypeNotFound(meetingTypeId: number): ApiError {
  return new ApiError(
    404,
    ERROR_CODES.MEETING_TYPE_NOT_FOUND,
    'Meeting type not found',
    { meetingTypeId },
  );
}

export function dateOutOfRange(
  date: string,
  earliestDate: string,
  latestDate: string,
): ApiError {
  return new ApiError(
    400,
    ERROR_CODES.DATE_OUT_OF_RANGE,
    'Date is outside the booking horizon',
    { date, earliestDate, latestDate },
  );
}
