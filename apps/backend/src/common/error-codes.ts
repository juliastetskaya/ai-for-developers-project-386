export const ERROR_CODES = {
  VALIDATION_FAILED: 'validation_failed',
  SLOT_UNAVAILABLE: 'slot_unavailable',
  MEETING_TYPE_NOT_FOUND: 'meeting_type_not_found',
  DATE_OUT_OF_RANGE: 'date_out_of_range',
  INTERNAL_ERROR: 'internal_error',
  NOT_FOUND: 'not_found',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
