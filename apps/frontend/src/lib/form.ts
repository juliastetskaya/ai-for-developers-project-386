import type { ApiError } from './api'

/** Shared input styling for every form on the booking and owner pages. */
export const inputClassName =
  'h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20'

/** Stable id linking a field to its validation message. */
export function fieldErrorId(prefix: string, field: string): string {
  return `${prefix}-${field}-error`
}

export interface SplitFieldErrors {
  /** Messages keyed by the form field they belong to. */
  fields: Record<string, string>
  /** Messages for fields the current form does not render. */
  otherMessages: string[]
}

/**
 * Turns the API's flat `details.fields` list into a map the form can render.
 * When `knownFields` is provided, messages for other fields are collected
 * separately instead of being dropped.
 */
export function splitValidationFieldErrors(
  error: ApiError,
  knownFields?: readonly string[],
): SplitFieldErrors {
  const fields: Record<string, string> = {}
  const otherMessages: string[] = []

  for (const fieldError of error.details?.fields ?? []) {
    if (knownFields === undefined || knownFields.includes(fieldError.field)) {
      fields[fieldError.field] = fieldError.message
    } else {
      otherMessages.push(fieldError.message)
    }
  }

  return { fields, otherMessages }
}
