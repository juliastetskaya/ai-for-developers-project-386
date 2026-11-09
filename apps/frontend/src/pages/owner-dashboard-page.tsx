import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Booking, MeetingType } from 'api-client'
import { Button } from '@/components/ui/button'
import {
  createMeetingType,
  listMeetingTypes,
  listUpcomingBookings,
  type ApiError,
  type ApiResult,
} from '@/lib/api'
import { formatOwnerDateTime } from '@/lib/owner-days'

type LoadStatus = 'loading' | 'error' | 'ready'

interface CreateFormState {
  name: string
  description: string
  durationMin: string
}

const emptyForm: CreateFormState = {
  name: '',
  description: '',
  durationMin: '',
}

const inputClassName =
  'h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20'

function fieldErrorId(field: string) {
  return `meeting-type-${field}-error`
}

function OwnerDashboardPage() {
  const [meetingTypes, setMeetingTypes] = useState<MeetingType[]>([])
  const [listStatus, setListStatus] = useState<LoadStatus>('loading')
  const [listError, setListError] = useState<ApiError | null>(null)

  const [bookings, setBookings] = useState<Booking[]>([])
  const [bookingsStatus, setBookingsStatus] = useState<LoadStatus>('loading')
  const [bookingsError, setBookingsError] = useState<ApiError | null>(null)

  const [form, setForm] = useState<CreateFormState>(emptyForm)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleResult = useCallback((result: ApiResult<MeetingType[]>) => {
    if (result.error) {
      setListError(result.error)
      setListStatus('error')
      return
    }

    setMeetingTypes(result.data)
    setListStatus('ready')
  }, [])

  useEffect(() => {
    void listMeetingTypes().then(handleResult)
  }, [handleResult])

  const handleBookingsResult = useCallback((result: ApiResult<Booking[]>) => {
    if (result.error) {
      setBookingsError(result.error)
      setBookingsStatus('error')
      return
    }

    setBookings(result.data)
    setBookingsStatus('ready')
  }, [])

  useEffect(() => {
    void listUpcomingBookings().then(handleBookingsResult)
  }, [handleBookingsResult])

  function retryMeetingTypes() {
    setListStatus('loading')
    setListError(null)
    void listMeetingTypes().then(handleResult)
  }

  function retryBookings() {
    setBookingsStatus('loading')
    setBookingsError(null)
    void listUpcomingBookings().then(handleBookingsResult)
  }

  function updateField(field: keyof CreateFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setFieldErrors({})
    setSubmitError(null)

    const durationIsBlank = form.durationMin.trim() === ''

    const result = await createMeetingType({
      name: form.name,
      ...(form.description.trim() === ''
        ? {}
        : { description: form.description }),
      durationMin: durationIsBlank ? Number.NaN : Number(form.durationMin),
    })

    if (result.error) {
      setIsSubmitting(false)

      if (result.error.code === 'validation_failed') {
        const errors: Record<string, string> = {}
        for (const field of result.error.details?.fields ?? []) {
          errors[field.field] = field.message
        }
        setFieldErrors(errors)
        return
      }

      setSubmitError(result.error.message)
      return
    }

    setMeetingTypes((current) => [...current, result.data])
    setForm(emptyForm)
    setIsSubmitting(false)
  }

  return (
    <section className="flex flex-col gap-10 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Owner dashboard
        </h1>
        <p className="text-muted-foreground">
          Create the meeting types guests can book.
        </p>
      </header>

      <div className="grid gap-10 lg:grid-cols-2">
        <section
          aria-labelledby="create-meeting-type-heading"
          className="flex flex-col gap-4 rounded-lg border p-6"
        >
          <h2
            id="create-meeting-type-heading"
            className="text-xl font-semibold"
          >
            Create a meeting type
          </h2>

          <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="meeting-type-name" className="text-sm font-medium">
                Name
              </label>
              <input
                id="meeting-type-name"
                name="name"
                value={form.name}
                onChange={(event) => updateField('name', event.target.value)}
                aria-invalid={fieldErrors.name ? 'true' : undefined}
                aria-describedby={
                  fieldErrors.name ? fieldErrorId('name') : undefined
                }
                className={inputClassName}
              />
              {fieldErrors.name && (
                <p
                  id={fieldErrorId('name')}
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {fieldErrors.name}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="meeting-type-description"
                className="text-sm font-medium"
              >
                Description (optional)
              </label>
              <textarea
                id="meeting-type-description"
                name="description"
                value={form.description}
                onChange={(event) =>
                  updateField('description', event.target.value)
                }
                rows={3}
                aria-invalid={fieldErrors.description ? 'true' : undefined}
                aria-describedby={
                  fieldErrors.description
                    ? fieldErrorId('description')
                    : undefined
                }
                className={`${inputClassName} h-auto py-2`}
              />
              {fieldErrors.description && (
                <p
                  id={fieldErrorId('description')}
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {fieldErrors.description}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="meeting-type-duration"
                className="text-sm font-medium"
              >
                Duration (minutes)
              </label>
              <input
                id="meeting-type-duration"
                name="durationMin"
                type="number"
                min={5}
                max={240}
                value={form.durationMin}
                onChange={(event) =>
                  updateField('durationMin', event.target.value)
                }
                aria-invalid={fieldErrors.durationMin ? 'true' : undefined}
                aria-describedby={
                  fieldErrors.durationMin
                    ? fieldErrorId('durationMin')
                    : undefined
                }
                className={inputClassName}
              />
              {fieldErrors.durationMin && (
                <p
                  id={fieldErrorId('durationMin')}
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {fieldErrors.durationMin}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create meeting type'}
              </Button>
              {submitError && (
                <p role="alert" className="text-sm text-destructive">
                  {submitError}
                </p>
              )}
            </div>
          </form>
        </section>

        <section
          aria-labelledby="meeting-types-heading"
          className="flex flex-col gap-4"
        >
          <h2 id="meeting-types-heading" className="text-xl font-semibold">
            Meeting types
          </h2>

          {listStatus === 'loading' && (
            <p role="status" className="text-muted-foreground">
              Loading meeting types...
            </p>
          )}

          {listStatus === 'error' && (
            <div
              role="alert"
              className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
            >
              <p>Couldn't load meeting types. {listError?.message}</p>
              <Button
                type="button"
                variant="outline"
                onClick={retryMeetingTypes}
              >
                Retry
              </Button>
            </div>
          )}

          {listStatus === 'ready' && meetingTypes.length === 0 && (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <h3 className="font-medium">No meeting types yet</h3>
              <p className="text-muted-foreground">
                Create your first meeting type to start accepting bookings.
              </p>
            </div>
          )}

          {listStatus === 'ready' && meetingTypes.length > 0 && (
            <ul className="flex flex-col gap-3">
              {meetingTypes.map((meetingType) => (
                <li key={meetingType.id}>
                  <article className="flex flex-col gap-1 rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-4">
                      <h3 className="font-medium">{meetingType.name}</h3>
                      <span className="text-sm text-muted-foreground whitespace-nowrap">
                        {meetingType.durationMin} minutes
                      </span>
                    </div>
                    {meetingType.description && (
                      <p className="text-sm text-muted-foreground">
                        {meetingType.description}
                      </p>
                    )}
                  </article>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section
        aria-labelledby="upcoming-bookings-heading"
        className="flex flex-col gap-4"
      >
        <h2 id="upcoming-bookings-heading" className="text-xl font-semibold">
          Upcoming bookings
        </h2>

        {bookingsStatus === 'loading' && (
          <p role="status" className="text-muted-foreground">
            Loading bookings...
          </p>
        )}

        {bookingsStatus === 'error' && (
          <div
            role="alert"
            className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
          >
            <p>Couldn't load bookings. {bookingsError?.message}</p>
            <Button type="button" variant="outline" onClick={retryBookings}>
              Retry
            </Button>
          </div>
        )}

        {bookingsStatus === 'ready' && bookings.length === 0 && (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <h3 className="font-medium">No upcoming bookings yet</h3>
            <p className="text-muted-foreground">
              Bookings made by guests will show up here.
            </p>
          </div>
        )}

        {bookingsStatus === 'ready' && bookings.length > 0 && (
          <ul aria-label="Upcoming bookings" className="flex flex-col gap-3">
            {bookings.map((booking) => (
              <li key={booking.id}>
                <article className="flex flex-col gap-1 rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="font-medium">{booking.meetingType.name}</h3>
                    <time
                      dateTime={booking.startAt}
                      className="text-sm text-muted-foreground whitespace-nowrap"
                    >
                      {formatOwnerDateTime(booking.startAt)}
                    </time>
                  </div>
                  <p className="text-sm">{booking.guestName}</p>
                  <a
                    href={`mailto:${booking.guestEmail}`}
                    className="text-sm text-muted-foreground"
                  >
                    {booking.guestEmail}
                  </a>
                  {booking.comment && (
                    <p className="text-sm text-muted-foreground">
                      {booking.comment}
                    </p>
                  )}
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}

export default OwnerDashboardPage
