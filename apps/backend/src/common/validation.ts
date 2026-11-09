import {
  validationFailed,
  type FieldError,
  type ValidationErrorDetails,
} from './api-error.js';

/**
 * Collects field-level validation errors and turns them into the
 * `validation_failed` API error. Feature tickets decide which rules apply.
 */
export class ValidationErrors {
  private readonly fields: FieldError[] = [];

  constructor(private readonly message = 'Request validation failed') {}

  add(field: string, message: string): this {
    this.fields.push({ field, message });
    return this;
  }

  addIf(condition: boolean, field: string, message: string): this {
    if (condition) {
      this.add(field, message);
    }
    return this;
  }

  get hasErrors(): boolean {
    return this.fields.length > 0;
  }

  toDetails(): ValidationErrorDetails {
    return { fields: [...this.fields] };
  }

  throwIfAny(): void {
    if (this.hasErrors) {
      throw validationFailed(this.fields, this.message);
    }
  }
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/** Reads a trimmed string. Missing optional values yield `null`. */
export function readString(
  record: Record<string, unknown>,
  field: string,
  errors: ValidationErrors,
  options: { required?: boolean } = {},
): string | null {
  const value = record[field];

  if (value === undefined || value === null || value === '') {
    if (options.required) {
      errors.add(field, 'This field is required.');
    }
    return null;
  }

  if (typeof value !== 'string') {
    errors.add(field, 'Must be a string.');
    return null;
  }

  const trimmed = value.trim();
  if (trimmed === '' && options.required) {
    errors.add(field, 'This field is required.');
    return null;
  }

  return trimmed;
}

/** Reads an integer that may arrive as a number or a numeric string. */
export function readInteger(
  record: Record<string, unknown>,
  field: string,
  errors: ValidationErrors,
  options: { required?: boolean } = {},
): number | null {
  const value = record[field];

  if (value === undefined || value === null || value === '') {
    if (options.required) {
      errors.add(field, 'This field is required.');
    }
    return null;
  }

  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN;

  if (!Number.isInteger(parsed)) {
    errors.add(field, 'Must be an integer.');
    return null;
  }

  return parsed;
}
