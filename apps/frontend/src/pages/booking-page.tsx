import { useCallback, useEffect, useRef, useState } from 'react'
import type { MeetingType, Slot } from 'api-client'
import { Button } from '@/components/ui/button'
import {
  getAvailability,
  listMeetingTypes,
  type ApiError,
  type ApiResult,
} from '@/lib/api'
import {
  formatOwnerDayHeading,
  formatOwnerTime,
  ownerDays,
  OWNER_TIMEZONE,
} from '@/lib/owner-days'

type LoadStatus = 'idle' | 'loading' | 'error' | 'ready'

function BookingPage() {
  const [meetingTypes, setMeetingTypes] = useState<MeetingType[]>([])
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [error, setError] = useState<ApiError | null>(null)

  const [days] = useState(() => ownerDays())
  const [selectedType, setSelectedType] = useState<MeetingType | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [slotsStatus, setSlotsStatus] = useState<LoadStatus>('idle')
  const [slotsError, setSlotsError] = useState<ApiError | null>(null)
  const [selectedSlotStart, setSelectedSlotStart] = useState<string | null>(
    null,
  )
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

  function retry() {
    setStatus('loading')
    setError(null)
    void listMeetingTypes().then(handleResult)
  }

  function selectMeetingType(meetingType: MeetingType) {
    slotsRequest.current += 1
    setSelectedType(meetingType)
    setSelectedDate(null)
    setSlots([])
    setSlotsStatus('idle')
    setSlotsError(null)
    setSelectedSlotStart(null)
  }

  function goBackToMeetingTypes() {
    slotsRequest.current += 1
    setSelectedType(null)
    setSelectedDate(null)
    setSlots([])
    setSlotsStatus('idle')
    setSlotsError(null)
    setSelectedSlotStart(null)
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
    void loadSlots(selectedType, date)
  }

  function retrySlots() {
    if (selectedType !== null && selectedDate !== null) {
      void loadSlots(selectedType, selectedDate)
    }
  }

  return (
    <section className="flex flex-col gap-8 py-12">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-muted-foreground">
          Step {selectedType === null ? 1 : 2} of 4
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
              <Button type="button" variant="outline" onClick={retry}>
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
                        onClick={() => setSelectedSlotStart(slot.startAt)}
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
        </>
      )}
    </section>
  )
}

export default BookingPage
