import { useCallback, useEffect, useState } from 'react'
import type { MeetingType } from 'api-client'
import { Button } from '@/components/ui/button'
import {
  listMeetingTypes,
  type ApiError,
  type ApiResult,
} from '@/lib/api'

type LoadStatus = 'loading' | 'error' | 'ready'

function BookingPage() {
  const [meetingTypes, setMeetingTypes] = useState<MeetingType[]>([])
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [error, setError] = useState<ApiError | null>(null)

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

  return (
    <section className="flex flex-col gap-8 py-12">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-muted-foreground">
          Step 1 of 4
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Booking</h1>
        <h2 className="text-xl font-medium">Choose a meeting type</h2>
        <p className="text-muted-foreground">
          Pick the kind of call you would like to book.
        </p>
      </header>

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
          <Button
            type="button"
            variant="outline"
            onClick={retry}
          >
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
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default BookingPage
