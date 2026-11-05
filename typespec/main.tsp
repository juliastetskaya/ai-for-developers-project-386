import "@typespec/http";

using TypeSpec.Http;

@service(#{ title: "Call Calendar API" })
namespace CallCalendarApi;

@route("/health")
namespace Health {
  /** Check that the API is up and running. */
  @get
  op check(): {
    @statusCode statusCode: 200;
    @body body: HealthStatus;
  };
}

model HealthStatus {
  status: "ok";
}
