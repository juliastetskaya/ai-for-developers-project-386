import "@typespec/http";

using TypeSpec.Http;

@service(#{ title: "Call Calendar API" })
namespace CallCalendarApi;

model HealthStatus {
  status: "ok";
}

// ---------------------------------------------------------------------------
// Error envelope: every API error has { statusCode, code, message, details? }.
// `details` is present only for the codes that define a shape for it.
// ---------------------------------------------------------------------------

model FieldError {
  /** Form field name the error belongs to. */
  field: string;
  /** Human-readable explanation for that field. */
  message: string;
}

model ValidationErrorDetails {
  fields: FieldError[];
}

model MeetingTypeNotFoundDetails {
  meetingTypeId: int32;
}

model DateOutOfRangeDetails {
  /** Requested calendar date, formatted as YYYY-MM-DD. */
  date: string;
  /** Earliest bookable calendar date, formatted as YYYY-MM-DD. */
  earliestDate: string;
  /** Latest bookable calendar date, formatted as YYYY-MM-DD. */
  latestDate: string;
}

/** Request fields failed validation. */
model ValidationFailedError {
  statusCode: 400;
  code: "validation_failed";
  message: string;
  details: ValidationErrorDetails;
}

/** The selected time interval now overlaps an existing Booking. */
model SlotUnavailableError {
  statusCode: 409;
  code: "slot_unavailable";
  message: string;
}

/** The requested Meeting Type does not exist. */
model MeetingTypeNotFoundError {
  statusCode: 404;
  code: "meeting_type_not_found";
  message: string;
  details: MeetingTypeNotFoundDetails;
}

/** The requested date is outside the bookable horizon. */
model DateOutOfRangeError {
  statusCode: 400;
  code: "date_out_of_range";
  message: string;
  details: DateOutOfRangeDetails;
}

/** An unexpected server error occurred; internals are only logged. */
model InternalError {
  statusCode: 500;
  code: "internal_error";
  message: string;
}

/** The requested route does not exist. */
model NotFoundError {
  statusCode: 404;
  code: "not_found";
  message: string;
}

model HealthCheckOk {
  @statusCode statusCode: 200;
  @body body: HealthStatus;
}

model HealthCheckInternalError {
  @statusCode statusCode: 500;
  @body body: InternalError;
}

@route("/health")
namespace Health {
  /** Check that the API is up and running. */
  @get
  op check(): HealthCheckOk | HealthCheckInternalError;
}

// ---------------------------------------------------------------------------
// Meeting Types
// ---------------------------------------------------------------------------

model MeetingType {
  /** Unique identifier. */
  id: int32;
  /** 1..100 characters, trimmed before saving. */
  name: string;
  /** Optional, at most 500 characters. */
  description: string | null;
  /** Duration in minutes, 5..240. */
  durationMin: int32;
  /** UTC ISO-8601 creation timestamp. */
  createdAt: utcDateTime;
}

model CreateMeetingTypeRequest {
  /** 1..100 characters, trimmed before saving. */
  name: string;
  /** Optional, at most 500 characters. */
  description?: string;
  /** Duration in minutes, 5..240. */
  durationMin: int32;
}

model ListMeetingTypesOk {
  @statusCode statusCode: 200;
  @body body: MeetingType[];
}

model ListMeetingTypesInternalError {
  @statusCode statusCode: 500;
  @body body: InternalError;
}

model CreateMeetingTypeOk {
  @statusCode statusCode: 201;
  @body body: MeetingType;
}

model CreateMeetingTypeValidationError {
  @statusCode statusCode: 400;
  @body body: ValidationFailedError;
}

model CreateMeetingTypeInternalError {
  @statusCode statusCode: 500;
  @body body: InternalError;
}

@route("/meeting-types")
namespace MeetingTypes {
  /** List every meeting type. Public. */
  @get
  op list(): ListMeetingTypesOk | ListMeetingTypesInternalError;

  /** Create a meeting type. */
  @post
  op create(
    @body body: CreateMeetingTypeRequest,
  ): CreateMeetingTypeOk | CreateMeetingTypeValidationError | CreateMeetingTypeInternalError;
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

model Slot {
  /** UTC ISO-8601 start timestamp. */
  startAt: utcDateTime;
  /** UTC ISO-8601 end timestamp. */
  endAt: utcDateTime;
}

model ListAvailabilityOk {
  @statusCode statusCode: 200;
  @body body: Slot[];
}

model ListAvailabilityValidationError {
  @statusCode statusCode: 400;
  @body body: ValidationFailedError;
}

model ListAvailabilityDateOutOfRange {
  @statusCode statusCode: 400;
  @body body: DateOutOfRangeError;
}

model ListAvailabilityMeetingTypeNotFound {
  @statusCode statusCode: 404;
  @body body: MeetingTypeNotFoundError;
}

model ListAvailabilityInternalError {
  @statusCode statusCode: 500;
  @body body: InternalError;
}

@route("/availability")
namespace Availability {
  /** Free slots of one calendar day for a meeting type, ascending in ISO UTC. */
  @get
  op list(
    @query meetingTypeId: int32,
    /** Calendar date in the owner timezone, formatted as YYYY-MM-DD. */
    @query date: string,
  ):
    | ListAvailabilityOk
    | ListAvailabilityValidationError
    | ListAvailabilityDateOutOfRange
    | ListAvailabilityMeetingTypeNotFound
    | ListAvailabilityInternalError;
}
