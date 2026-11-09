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
