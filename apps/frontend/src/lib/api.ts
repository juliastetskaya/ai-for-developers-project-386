import {
  client,
  meetingTypesCreate,
  meetingTypesList,
  type CreateMeetingTypeRequest,
  type FieldError,
  type MeetingType,
} from 'api-client'

const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

client.setConfig({ baseUrl })

const FALLBACK_MESSAGE = 'Something went wrong. Please try again.'

export interface ApiError {
  /** HTTP status, or `0` when the request never reached the server. */
  status: number
  code: string
  message: string
  details?: {
    fields?: FieldError[]
  }
}

export type ApiResult<T> =
  | { data: T; error: null }
  | { data: null; error: ApiError }

/**
 * Turns any SDK error payload into one predictable shape. Error envelopes
 * already carry `{ statusCode, code, message, details }`; network failures and
 * unexpected payloads fall back to a generic message.
 */
export function normalizeApiError(error: unknown): ApiError {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as Record<string, unknown>
    const details =
      typeof candidate.details === 'object' && candidate.details !== null
        ? (candidate.details as { fields?: FieldError[] })
        : undefined

    return {
      status:
        typeof candidate.statusCode === 'number' ? candidate.statusCode : 0,
      code: typeof candidate.code === 'string' ? candidate.code : 'network_error',
      message:
        typeof candidate.message === 'string'
          ? candidate.message
          : FALLBACK_MESSAGE,
      details,
    }
  }

  return {
    status: 0,
    code: 'network_error',
    message: FALLBACK_MESSAGE,
  }
}

export async function listMeetingTypes(): Promise<ApiResult<MeetingType[]>> {
  const result = await meetingTypesList()

  if (result.error !== undefined) {
    return { data: null, error: normalizeApiError(result.error) }
  }

  return { data: result.data ?? [], error: null }
}

export async function createMeetingType(
  input: CreateMeetingTypeRequest,
): Promise<ApiResult<MeetingType>> {
  const result = await meetingTypesCreate({ body: input })

  if (result.error !== undefined) {
    return { data: null, error: normalizeApiError(result.error) }
  }

  if (result.data === undefined) {
    return {
      data: null,
      error: { status: 0, code: 'network_error', message: FALLBACK_MESSAGE },
    }
  }

  return { data: result.data, error: null }
}
