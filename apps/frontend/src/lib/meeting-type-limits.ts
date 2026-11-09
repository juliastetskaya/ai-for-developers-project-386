/** Validation limits mirrored from the API contract for Meeting Types. */
export const MEETING_TYPE_LIMITS = {
  nameMaxLength: 100,
  descriptionMaxLength: 500,
  durationMin: {
    min: 5,
    max: 240,
  },
} as const
