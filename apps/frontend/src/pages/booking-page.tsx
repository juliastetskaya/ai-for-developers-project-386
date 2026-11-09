import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import type { Booking, MeetingType, Slot } from 'api-client'
import { Button } from '@/components/ui/button'
import {
  createBooking,
  getAvailability,
  listMeetingTypes,
  type ApiError,
  type ApiResult,
} from '@/lib/api'
import {
  formatOwnerDayHeading,
  formatOwnerTime,
  ownerDateOf,
  ownerDays,
  OWNER_TIMEZONE,
} from '@/lib/owner-days'

type LoadStatus = 'idle' | 'loading' | 'error' | 'ready'

interface GuestFormState {
  name: string
  email: string
  comment: string
}

const emptyGuestForm: GuestFormState = {
  name: '',
  email: '',
  comment: '',
}

const SLOT_TAKEN_MESSAGE =
  'That time was just booked by someone else. The available times have been updated — please pick another slot.'
const MEETING_TYPE_GONE_MESSAGE =
  'This meeting type is no longer available. Please choose another one.'
const GENERAL_BOOKING_ERROR =
  'Something went wrong while booking. Your details are still here — please try again.'

const inputClassName =
  'h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20'

function fieldErrorId(field: string) {
  return `booking-guest-${field}-error`
}

function BookingPage() {
  const [meetingTypes, setMeetingTypes] = useState<MeetingType[]>([])
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [error, setError] = useState<ApiError | null>(null)
  const [meetingTypesNotice, setMeetingTypesNotice] = useState<string | null>(
    null,
  )

  const [days] = useState(() => ownerDays())
  const [selectedType, setSelectedType] = useState<MeetingType | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [slotsStatus, setSlotsStatus] = useState<LoadStatus>('idle')
  const [slotsError, setSlotsError] = useState<ApiError | null>(null)
  const [selectedSlotStart, setSelectedSlotStart] = useState<string | null>(
    null,
  )
  const [conflictMessage, setConflictMessage] = useState<string | null>(null)

  const [guest, setGuest] = useState<GuestFormState>(emptyGuestForm)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null)

  const slotsRequest = useRef(0)

  const handleResult = useCallback((result: ApiResult<MeetingType[]>) => {
    if (result.error) {
      setError(result.error)
      setStatus('error')
      return
    }

    setMeetingTypes(result.data)
    setStatus('ready')
  }, [])

  useEffect(() => {
    void listMeetingTypes().then(handleResult)
  }, [handleResult])

  function resetStayOnMeetingTypes() {
    slotsRequest.current += 1
    setSelectedDate(null)
    setSlots([])
    setSlotsStatus('idle')
    setSlotsError(null)
    setSelectedSlotStart(null)
    setConflictMessage(null)
    setGuest(emptyGuestForm)
    setFieldErrors({})
    setSubmitError(null)
    setIsSubmitting(false)
    setConfirmedBooking(null)
  }

  function retryMeetingTypes() {
    setStatus('loading')
    setError(null)
    setMeetingTypesNotice(null)
    void listMeetingTypes().then(handleResult)
  }

  function selectMeetingType(meetingType: MeetingType) {
    resetStayOnMeetingTypes()
    setMeetingTypesNotice(null)
    setSelectedType(meetingType)
  }

  function goBackToMeetingTypes() {
    resetStayOnMeetingTypes()
    setSelectedType(null)
  }

  function bookAnotherMeeting() {
    resetStayOnMeetingTypes()
    setSelectedType(null)
    setStatus('loading')
    setError(null)
    void listMeetingTypes().then(handleResult)
  }

  function returnToMeetingTypesAfterMissingType() {
    resetStayOnMeetingTypes()
    setSelectedType(null)
    setMeetingTypesNotice(MEETING_TYPE_GONE_MESSAGE)
    setStatus('loading')
    setError(null)
    void listMeetingTypes().then(handleResult)
  }

  async function loadSlots(meetingType: MeetingType, date: string) {
    const requestId = ++slotsRequest.current
    setSlotsStatus('loading')
    setSlotsError(null)
    setSelectedSlotStart(null)

    const result = await getAvailability(meetingType.id, date)

    if (requestId !== slotsRequest.current) {
      return
    }

    if (result.error) {
      setSlotsError(result.error)
      setSlotsStatus('error')
      return
    }

    setSlots(result.data)
    setSlotsStatus('ready')
  }

  function selectDay(date: string) {
    if (selectedType === null) {
      return
    }

    setSelectedDate(date)
    setConflictMessage(null)
    setGuest(emptyGuestForm)
    setFieldErrors({})
    setSubmitError(null)
    void loadSlots(selectedType, date)
  }

  function selectSlot(slot: Slot) {
    setSelectedSlotStart(slot.startAt)
    setConflictMessage(null)
    setFieldErrors({})
    setSubmitError(null)
  }

  function retrySlots() {
    if (selectedType !== null && selectedDate !== null) {
      void loadSlots(selectedType, selectedDate)
    }
  }

  function updateGuestField(field: keyof GuestFormState, value: string) {
    setGuest((current) => ({ ...current, [field]: value }))
  }

  const selectedSlot =
    slots.find((slot) => slot.startAt === selectedSlotStart) ?? null
  const selectedSlotRange =
    selectedSlot === null
      ? ''
      : `${formatOwnerTime(selectedSlot.startAt)}–${formatOwnerTime(selectedSlot.endAt)} · ${OWNER_TIMEZONE}`

  async function handleBookingSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (selectedType === null || selectedSlot === null) {
      return
    }

    setIsSubmitting(true)
    setFieldErrors({})
    setSubmitError(null)
    setConflictMessage(null)

    const result = await createBooking({
      meetingTypeId: selectedType.id,
      startAt: selectedSlot.startAt,
      guestName: guest.name,
      guestEmail: guest.email,
      ...(guest.comment.trim() === '' ? {} : { comment: guest.comment }),
    })

    setIsSubmitting(false)

    if (result.error) {
      if (result.error.code === 'validation_failed') {
        const errors: Record<string, string> = {}
        const otherMessages: string[] = []

        for (const field of result.error.details?.fields ?? []) {
          if (
            field.field === 'guestName' ||
            field.field === 'guestEmail' ||
            field.field === 'comment'
          ) {
            errors[field.field] = field.message
          } else {
            otherMessages.push(field.message)
          }
        }

        setFieldErrors(errors)
        if (otherMessages.length > 0) {
          setSubmitError(otherMessages.join(' '))
        }
        return
      }

      if (result.error.code === 'slot_unavailable') {
        setConflictMessage(SLOT_TAKEN_MESSAGE)
        setSelectedSlotStart(null)
        // Refresh the day so the guest can pick another time. The POST is
        // never repeated automatically.
        void loadSlots(selectedType, selectedDate ?? ownerDateOf(selectedSlot.startAt))
        return
      }

      if (result.error.code === 'meeting_type_not_found') {
        returnToMeetingTypesAfterMissingType()
        return
      }

      setSubmitError(GENERAL_BOOKING_ERROR)
      return
    }

    setConfirmedBooking(result.data)
  }

  if (confirmedBooking !== null) {
    const bookingDate = ownerDateOf(confirmedBooking.startAt)
    const timeRange = `${formatOwnerTime(confirmedBooking.startAt)}–${formatOwnerTime(confirmedBooking.endAt)} · ${OWNER_TIMEZONE}`

    return (
      <section className="flex flex-col gap-8 py-12">
        <header className="flex flex-col gap-2">
          <p className="text-sm font-medium text-muted-foreground">
            Step 4 of 4
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Booking confirmed
          </h1>
          <p className="text-muted-foreground">
            Your meeting is booked. Keep these details for your records.
          </p>
        </header>

        <article className="flex flex-col gap-6 rounded-lg border bg-card p-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-medium">
              {confirmedBooking.meetingType.name}
            </h2>
            <p className="text-muted-foreground">
              {formatOwnerDayHeading(bookingDate)}
            </p>
            <p className="font-medium">{timeRange}</p>
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground">Name</dt>
              <dd className="font-medium">{confirmedBooking.guestName}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="font-medium">{confirmedBooking.guestEmail}</dd>
            </div>
            {confirmedBooking.comment && (
              <div className="flex flex-col gap-0.5 sm:col-span-2">
                <dt className="text-muted-foreground">Comment</dt>
                <dd className="font-medium">{confirmedBooking.comment}</dd>
              </div>
            )}
          </dl>
        </article>

        <div>
          <Button type="button" variant="outline" onClick={bookAnotherMeeting}>
            Book another meeting
          </Button>
        </div>
      </section>
    )
  }

  const step = selectedSlot !== null ? 3 : selectedType !== null ? 2 : 1

  return (
    <section className="flex flex-col gap-8 py-12">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-muted-foreground">
          Step {step} of 4
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Booking</h1>
        {selectedType === null ? (
          <>
            <h2 className="text-xl font-medium">Choose a meeting type</h2>
            <p className="text-muted-foreground">
              Pick the kind of call you would like to book.
            </p>
          </>
        ) : (
          <>
            <h2 className="text-xl font-medium">Choose a day and time</h2>
            <p className="text-muted-foreground">
              Pick a free slot on one of the next 14 days. Times are shown in{' '}
              {OWNER_TIMEZONE}.
            </p>
          </>
        )}
      </header>

      {selectedType === null && (
        <>
          {meetingTypesNotice && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/5 p-4"
            >
              <p>{meetingTypesNotice}</p>
            </div>
          )}

          {status === 'loading' && (
            <p role="status" className="text-muted-foreground">
              Loading meeting types...
            </p>
          )}

          {status === 'error' && (
            <div
              role="alert"
              className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
            >
              <p>Couldn't load meeting types. {error?.message}</p>
              <Button type="button" variant="outline" onClick={retryMeetingTypes}>
                Retry
              </Button>
            </div>
          )}

          {status === 'ready' && meetingTypes.length === 0 && (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <h3 className="font-medium">No meeting types yet</h3>
              <p className="text-muted-foreground">
                The calendar owner hasn't published any meeting types yet. Check
                back soon.
              </p>
            </div>
          )}

          {status === 'ready' && meetingTypes.length > 0 && (
            <ul className="grid gap-4 sm:grid-cols-2">
              {meetingTypes.map((meetingType) => (
                <li key={meetingType.id}>
                  <article className="flex h-full flex-col gap-2 rounded-lg border bg-card p-6">
                    <div className="flex items-start justify-between gap-4">
                      <h3 className="text-lg font-medium">{meetingType.name}</h3>
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-sm whitespace-nowrap">
                        {meetingType.durationMin} minutes
                      </span>
                    </div>
                    {meetingType.description && (
                      <p className="text-muted-foreground">
                        {meetingType.description}
                      </p>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      aria-label={`Select ${meetingType.name}`}
                      className="mt-auto self-start"
                      onClick={() => selectMeetingType(meetingType)}
                    >
                      Select
                    </Button>
                  </article>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {selectedType !== null && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
            <div className="flex flex-col gap-1">
              <p className="font-medium">
                {selectedType.name} · {selectedType.durationMin} minutes
              </p>
              {selectedType.description && (
                <p className="text-sm text-muted-foreground">
                  {selectedType.description}
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={goBackToMeetingTypes}
            >
              Change meeting type
            </Button>
          </div>

          <section aria-labelledby="choose-day-heading" className="flex flex-col gap-3">
            <h3 id="choose-day-heading" className="text-lg font-medium">
              Choose a day
            </h3>
            <ul
              aria-label="Available days"
              className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7"
            >
              {days.map((day) => (
                <li key={day.date}>
                  <button
                    type="button"
                    aria-pressed={selectedDate === day.date}
                    onClick={() => selectDay(day.date)}
                    className="flex w-full flex-col items-center gap-0.5 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted aria-pressed:border-foreground aria-pressed:bg-muted"
                  >
                    <span className="font-medium">{day.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {day.isToday ? 'Today' : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {selectedDate !== null && (
            <section
              aria-labelledby="available-times-heading"
              className="flex flex-col gap-3"
            >
              <div className="flex flex-col gap-1">
                <h3
                  id="available-times-heading"
                  className="text-lg font-medium"
                >
                  Available times
                </h3>
                <p className="text-sm text-muted-foreground">
                  {formatOwnerDayHeading(selectedDate)} · {OWNER_TIMEZONE}
                </p>
              </div>

              {conflictMessage && (
                <div
                  role="alert"
                  className="rounded-lg border border-destructive/40 bg-destructive/5 p-4"
                >
                  <p>{conflictMessage}</p>
                </div>
              )}

              {slotsStatus === 'loading' && (
                <p role="status" className="text-muted-foreground">
                  Loading available slots...
                </p>
              )}

              {slotsStatus === 'error' && slotsError && (
                <div
                  role="alert"
                  className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
                >
                  {slotsError.code === 'date_out_of_range' ? (
                    <p>
                      This date is outside the booking horizon. Pick another
                      day.
                    </p>
                  ) : (
                    <>
                      <p>
                        Couldn't load available slots. {slotsError.message}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={retrySlots}
                      >
                        Retry
                      </Button>
                    </>
                  )}
                </div>
              )}

              {slotsStatus === 'ready' && slots.length === 0 && (
                <div className="rounded-lg border border-dashed p-8 text-center">
                  <h4 className="font-medium">No free slots on this day</h4>
                  <p className="text-muted-foreground">
                    Every time on this day is already booked. Pick another day.
                  </p>
                </div>
              )}

              {slotsStatus === 'ready' && slots.length > 0 && (
                <ul
                  aria-label="Available slots"
                  className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6"
                >
                  {slots.map((slot) => (
                    <li key={slot.startAt}>
                      <button
                        type="button"
                        aria-pressed={selectedSlotStart === slot.startAt}
                        onClick={() => selectSlot(slot)}
                        className="w-full rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted aria-pressed:border-foreground aria-pressed:bg-muted"
                      >
                        {formatOwnerTime(slot.startAt)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {selectedSlot !== null && (
            <section
              aria-labelledby="guest-details-heading"
              className="flex flex-col gap-4 rounded-lg border bg-card p-6"
            >
              <div className="flex flex-col gap-1">
                <h3 id="guest-details-heading" className="text-lg font-medium">
                  Your details
                </h3>
                <p className="text-sm text-muted-foreground">
                  {selectedSlotRange}
                </p>
              </div>

              <form
                className="flex flex-col gap-4"
                onSubmit={handleBookingSubmit}
                noValidate
              >
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="booking-guest-name"
                    className="text-sm font-medium"
                  >
                    Name
                  </label>
                  <input
                    id="booking-guest-name"
                    name="guestName"
                    value={guest.name}
                    onChange={(event) =>
                      updateGuestField('name', event.target.value)
                    }
                    aria-invalid={fieldErrors.guestName ? 'true' : undefined}
                    aria-describedby={
                      fieldErrors.guestName
                        ? fieldErrorId('guestName')
                        : undefined
                    }
                    className={inputClassName}
                  />
                  {fieldErrors.guestName && (
                    <p
                      id={fieldErrorId('guestName')}
                      role="alert"
                      className="text-sm text-destructive"
                    >
                      {fieldErrors.guestName}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="booking-guest-email"
                    className="text-sm font-medium"
                  >
                    Email
                  </label>
                  <input
                    id="booking-guest-email"
                    name="guestEmail"
                    type="email"
                    value={guest.email}
                    onChange={(event) =>
                      updateGuestField('email', event.target.value)
                    }
                    aria-invalid={fieldErrors.guestEmail ? 'true' : undefined}
                    aria-describedby={
                      fieldErrors.guestEmail
                        ? fieldErrorId('guestEmail')
                        : undefined
                    }
                    className={inputClassName}
                  />
                  {fieldErrors.guestEmail && (
                    <p
                      id={fieldErrorId('guestEmail')}
                      role="alert"
                      className="text-sm text-destructive"
                    >
                      {fieldErrors.guestEmail}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="booking-guest-comment"
                    className="text-sm font-medium"
                  >
                    Comment (optional)
                  </label>
                  <textarea
                    id="booking-guest-comment"
                    name="comment"
                    value={guest.comment}
                    onChange={(event) =>
                      updateGuestField('comment', event.target.value)
                    }
                    rows={3}
                    aria-invalid={fieldErrors.comment ? 'true' : undefined}
                    aria-describedby={
                      fieldErrors.comment
                        ? fieldErrorId('comment')
                        : undefined
                    }
                    className={`${inputClassName} h-auto py-2`}
                  />
                  {fieldErrors.comment && (
                    <p
                      id={fieldErrorId('comment')}
                      role="alert"
                      className="text-sm text-destructive"
                    >
                      {fieldErrors.comment}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Booking...' : 'Confirm booking'}
                  </Button>
                  {submitError && (
                    <p role="alert" className="text-sm text-destructive">
                      {submitError}
                    </p>
                  )}
                </div>
              </form>
            </section>
          )}
        </>
      )}
    </section>
  )
}

export default BookingPage
