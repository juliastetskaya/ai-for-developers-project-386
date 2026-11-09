import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import type { Booking, MeetingType, Slot } from 'api-client'
import { AsyncSection } from '@/components/async-section'
import BookingCalendar from '@/components/booking-calendar'
import { Button } from '@/components/ui/button'
import {
  createBooking,
  getAvailability,
  listMeetingTypes,
  type ApiError,
  type ApiResult,
} from '@/lib/api'
import { fieldErrorId, inputClassName, splitValidationFieldErrors } from '@/lib/form'
import type { LoadStatus } from '@/lib/load-status'
import {
  formatOwnerDayHeading,
  formatOwnerTime,
  ownerDateOf,
  OWNER_TIMEZONE,
} from '@/lib/owner-days'
import { useOwnerDays } from '@/lib/use-owner-days'

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

const GUEST_FORM_FIELDS = ['guestName', 'guestEmail', 'comment'] as const
const FIELD_ERROR_PREFIX = 'booking-guest'

const SLOT_TAKEN_MESSAGE =
  'That time was just booked by someone else. The available times have been updated — please pick another slot.'
const MEETING_TYPE_GONE_MESSAGE =
  'This meeting type is no longer available. Please choose another one.'
const GENERAL_BOOKING_ERROR =
  'Something went wrong while booking. Your details are still here — please try again.'

function BookingPage() {
  const [meetingTypes, setMeetingTypes] = useState<MeetingType[]>([])
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [error, setError] = useState<ApiError | null>(null)
  const [meetingTypesNotice, setMeetingTypesNotice] = useState<string | null>(
    null,
  )

  const days = useOwnerDays()
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

  const handleMeetingTypesResult = useCallback(
    (result: ApiResult<MeetingType[]>) => {
      if (result.error) {
        setError(result.error)
        setStatus('error')
        return
      }

      setMeetingTypes(result.data)
      setStatus('ready')
    },
    [],
  )

  const reloadMeetingTypes = useCallback(() => {
    setStatus('loading')
    setError(null)
    void listMeetingTypes().then(handleMeetingTypesResult)
  }, [handleMeetingTypesResult])

  useEffect(() => {
    void listMeetingTypes().then(handleMeetingTypesResult)
  }, [handleMeetingTypesResult])

  const resetBookingDetails = useCallback(() => {
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
  }, [])

  function retryMeetingTypes() {
    setMeetingTypesNotice(null)
    reloadMeetingTypes()
  }

  function restartBookingFlow(notice: string | null = null) {
    resetBookingDetails()
    setSelectedType(null)
    setMeetingTypesNotice(notice)
    reloadMeetingTypes()
  }

  function selectMeetingType(meetingType: MeetingType) {
    resetBookingDetails()
    setMeetingTypesNotice(null)
    setSelectedType(meetingType)
  }

  function goBackToMeetingTypes() {
    resetBookingDetails()
    setSelectedType(null)
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
      if (result.error.code === 'meeting_type_not_found') {
        restartBookingFlow(MEETING_TYPE_GONE_MESSAGE)
        return
      }

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

  /**
   * A day that fell out of the refreshed horizon is no longer offered, even if
   * it was selected before the owner-timezone date rolled over.
   */
  const activeDate =
    selectedDate !== null && days.some((day) => day.date === selectedDate)
      ? selectedDate
      : null

  function retrySlots() {
    if (selectedType !== null && activeDate !== null) {
      void loadSlots(selectedType, activeDate)
    }
  }

  function updateGuestField(field: keyof GuestFormState, value: string) {
    setGuest((current) => ({ ...current, [field]: value }))
  }

  const selectedSlot =
    activeDate === null
      ? null
      : (slots.find((slot) => slot.startAt === selectedSlotStart) ?? null)
  const selectedSlotRange =
    selectedSlot === null
      ? ''
      : `${formatOwnerTime(selectedSlot.startAt)}–${formatOwnerTime(selectedSlot.endAt)} · ${OWNER_TIMEZONE}`

  async function handleBookingSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (selectedType === null || activeDate === null || selectedSlot === null) {
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
        const { fields, otherMessages } = splitValidationFieldErrors(
          result.error,
          GUEST_FORM_FIELDS,
        )

        setFieldErrors(fields)
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
        void loadSlots(selectedType, activeDate)
        return
      }

      if (result.error.code === 'meeting_type_not_found') {
        restartBookingFlow(MEETING_TYPE_GONE_MESSAGE)
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

        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={() => restartBookingFlow()}
        >
          Book another meeting
        </Button>
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

          <AsyncSection
            status={status}
            loadingMessage="Loading meeting types..."
            errorMessage={`Couldn't load meeting types. ${error?.message ?? ''}`}
            onRetry={retryMeetingTypes}
            isEmpty={meetingTypes.length === 0}
            emptyTitle="No meeting types yet"
            emptyMessage="The calendar owner hasn't published any meeting types yet. Check back soon."
          >
            <ul className="grid gap-4 sm:grid-cols-2">
              {meetingTypes.map((meetingType) => (
                <li key={meetingType.id}>
                  <article className="relative flex h-full flex-col gap-2 rounded-lg border bg-card p-6 transition-colors hover:border-primary/50 hover:bg-primary/5 focus-within:ring-3 focus-within:ring-ring/50">
                    <div className="flex items-start justify-between gap-4">
                      <h3
                        id={`meeting-type-${meetingType.id}`}
                        className="text-lg font-medium"
                      >
                        {meetingType.name}
                      </h3>
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-sm whitespace-nowrap">
                        {meetingType.durationMin} minutes
                      </span>
                    </div>
                    {meetingType.description && (
                      <p className="text-muted-foreground">
                        {meetingType.description}
                      </p>
                    )}
                    <button
                      type="button"
                      aria-labelledby={`meeting-type-${meetingType.id}`}
                      onClick={() => selectMeetingType(meetingType)}
                      className="absolute inset-0 cursor-pointer rounded-lg focus-visible:outline-none"
                    />
                  </article>
                </li>
              ))}
            </ul>
          </AsyncSection>
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

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
            <section
              aria-labelledby="choose-day-heading"
              className="flex flex-col gap-4 rounded-lg border bg-card p-4 sm:p-6"
            >
              <div className="flex flex-col gap-1">
                <h3 id="choose-day-heading" className="text-lg font-medium">
                  Choose a day
                </h3>
                <p className="text-sm text-muted-foreground">
                  Next 14 days · {OWNER_TIMEZONE}
                </p>
              </div>
              <BookingCalendar
                days={days}
                selectedDate={activeDate}
                onSelect={selectDay}
              />
            </section>

            <section
              aria-labelledby="available-times-heading"
              className="flex flex-col gap-4 rounded-lg border bg-card p-4 sm:p-6 lg:sticky lg:top-6"
            >
              <div className="flex flex-col gap-1">
                <h3
                  id="available-times-heading"
                  className="text-lg font-medium"
                >
                  Available times
                </h3>
                <p className="text-sm text-muted-foreground">
                  {activeDate === null
                    ? 'Pick a day to see available times.'
                    : `${formatOwnerDayHeading(activeDate)} · ${OWNER_TIMEZONE}`}
                </p>
              </div>

              {activeDate !== null && (
                <>
                  {conflictMessage && (
                    <div
                      role="alert"
                      className="rounded-lg border border-destructive/40 bg-destructive/5 p-4"
                    >
                      <p>{conflictMessage}</p>
                    </div>
                  )}

                  <AsyncSection
                    status={slotsStatus}
                    loadingMessage="Loading available slots..."
                    errorMessage={
                      slotsError?.code === 'date_out_of_range'
                        ? 'This date is outside the booking horizon. Pick another day.'
                        : `Couldn't load available slots. ${slotsError?.message ?? ''}`
                    }
                    onRetry={
                      slotsError?.code === 'date_out_of_range'
                        ? undefined
                        : retrySlots
                    }
                    isEmpty={slots.length === 0}
                    emptyTitle="No free slots on this day"
                    emptyMessage="Every time on this day is already booked. Pick another day."
                  >
                    <ul
                      aria-label="Available slots"
                      className="grid grid-cols-2 gap-2"
                    >
                      {slots.map((slot) => (
                        <li key={slot.startAt}>
                          <button
                            type="button"
                            aria-pressed={
                              selectedSlotStart === slot.startAt
                            }
                            onClick={() => selectSlot(slot)}
                            className="h-10 w-full rounded-lg border px-2 text-sm font-medium transition-colors hover:bg-muted aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                          >
                            {formatOwnerTime(slot.startAt)}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </AsyncSection>
                </>
              )}
            </section>
          </div>

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
                        ? fieldErrorId(FIELD_ERROR_PREFIX, 'guestName')
                        : undefined
                    }
                    className={inputClassName}
                  />
                  {fieldErrors.guestName && (
                    <p
                      id={fieldErrorId(FIELD_ERROR_PREFIX, 'guestName')}
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
                        ? fieldErrorId(FIELD_ERROR_PREFIX, 'guestEmail')
                        : undefined
                    }
                    className={inputClassName}
                  />
                  {fieldErrors.guestEmail && (
                    <p
                      id={fieldErrorId(FIELD_ERROR_PREFIX, 'guestEmail')}
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
                        ? fieldErrorId(FIELD_ERROR_PREFIX, 'comment')
                        : undefined
                    }
                    className={`${inputClassName} h-auto py-2`}
                  />
                  {fieldErrors.comment && (
                    <p
                      id={fieldErrorId(FIELD_ERROR_PREFIX, 'comment')}
                      role="alert"
                      className="text-sm text-destructive"
                    >
                      {fieldErrors.comment}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <Button
                    type="submit"
                    className="h-11 px-6 text-base"
                    disabled={isSubmitting}
                  >
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
