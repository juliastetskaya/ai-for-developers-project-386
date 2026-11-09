import {
  availabilityList,
  bookingsCreate,
  bookingsList,
  client,
  meetingTypesCreate,
  meetingTypesList,
  type Booking,
  type CreateBookingRequest,
  type CreateMeetingTypeRequest,
  type FieldError,
  type MeetingType,
  type Slot,
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

function networkError(): ApiError {
  return { status: 0, code: 'network_error', message: FALLBACK_MESSAGE }
}

/**
 * One unwrap for every SDK call: an error payload keeps its envelope, while a
 * missing body (never expected from these endpoints) becomes a network error
 * instead of being silently coerced to an empty list.
 */
function unwrapResult<T>(result: {
  data?: T
  error?: unknown
}): ApiResult<T> {
  if (result.error !== undefined) {
    return { data: null, error: normalizeApiError(result.error) }
  }

  if (result.data === undefined) {
    return { data: null, error: networkError() }
  }

  return { data: result.data, error: null }
}

export async function listMeetingTypes(): Promise<ApiResult<MeetingType[]>> {
  return unwrapResult(await meetingTypesList())
}

export async function createMeetingType(
  input: CreateMeetingTypeRequest,
): Promise<ApiResult<MeetingType>> {
  return unwrapResult(await meetingTypesCreate({ body: input }))
}

export async function getAvailability(
  meetingTypeId: number,
  date: string,
): Promise<ApiResult<Slot[]>> {
  return unwrapResult(
    await availabilityList({ query: { meetingTypeId, date } }),
  )
}

export async function createBooking(
  input: CreateBookingRequest,
): Promise<ApiResult<Booking>> {
  return unwrapResult(await bookingsCreate({ body: input }))
}

/** Every booking that has not started yet, in the server's ascending order. */
export async function listUpcomingBookings(): Promise<ApiResult<Booking[]>> {
  return unwrapResult(await bookingsList({ query: { scope: 'upcoming' } }))
}
