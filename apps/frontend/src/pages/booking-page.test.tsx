import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import type { Booking, MeetingType, Slot } from 'api-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createBooking,
  getAvailability,
  listMeetingTypes,
  type ApiResult,
} from '@/lib/api'
import BookingPage from './booking-page'

vi.mock('@/lib/api', () => ({
  listMeetingTypes: vi.fn(),
  createMeetingType: vi.fn(),
  getAvailability: vi.fn(),
  createBooking: vi.fn(),
}))

const mockedListMeetingTypes = vi.mocked(listMeetingTypes)
const mockedGetAvailability = vi.mocked(getAvailability)
const mockedCreateBooking = vi.mocked(createBooking)

const introCall: MeetingType = {
  id: 1,
  name: 'Intro call',
  description: 'Get to know each other and see if we are a good fit.',
  durationMin: 15,
  createdAt: '2026-11-01T10:00:00.000Z',
}

const strategyCall: MeetingType = {
  id: 2,
  name: 'Strategy call',
  description: null,
  durationMin: 60,
  createdAt: '2026-11-02T10:00:00.000Z',
}

const morningSlots: Slot[] = [
  {
    startAt: '2026-11-10T06:00:00.000Z',
    endAt: '2026-11-10T06:15:00.000Z',
  },
  {
    startAt: '2026-11-10T06:15:00.000Z',
    endAt: '2026-11-10T06:30:00.000Z',
  },
]

const onlyRemainingSlot: Slot[] = [morningSlots[1]]

const createdBooking: Booking = {
  id: 10,
  meetingTypeId: introCall.id,
  meetingType: introCall,
  startAt: morningSlots[0].startAt,
  endAt: morningSlots[0].endAt,
  guestName: 'Ada Lovelace',
  guestEmail: 'ada@example.com',
  comment: 'Looking forward to it.',
  createdAt: '2026-11-09T12:00:00.000Z',
}

function resolvedMeetingTypes(
  data: MeetingType[],
): ApiResult<MeetingType[]> {
  return { data, error: null }
}

function resolvedSlots(data: Slot[]): ApiResult<Slot[]> {
  return { data, error: null }
}

async function selectIntroCall() {
  mockedListMeetingTypes.mockResolvedValue(
    resolvedMeetingTypes([introCall, strategyCall]),
  )

  render(<BookingPage />)

  await screen.findByRole('heading', { name: 'Intro call' })
  fireEvent.click(screen.getByRole('button', { name: 'Select Intro call' }))
  await screen.findByRole('heading', { name: 'Choose a day and time' })
}

function dayButtons(): HTMLElement[] {
  const list = screen.getByRole('list', { name: 'Available days' })
  return within(list).getAllByRole('button')
}

async function selectFirstSlot() {
  await selectIntroCall()
  mockedGetAvailability.mockResolvedValue(resolvedSlots(morningSlots))

  fireEvent.click(dayButtons()[0])
  fireEvent.click(await screen.findByRole('button', { name: '09:00' }))

  await screen.findByRole('heading', { name: 'Your details' })
}

function fillGuestDetails(overrides: Partial<Record<string, string>> = {}) {
  fireEvent.change(screen.getByLabelText('Name'), {
    target: { value: overrides.name ?? 'Ada Lovelace' },
  })
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: overrides.email ?? 'ada@example.com' },
  })
  fireEvent.change(screen.getByLabelText('Comment (optional)'), {
    target: { value: overrides.comment ?? 'Looking forward to it.' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('BookingPage', () => {
  it('shows the meeting type cards returned by the API', async () => {
    mockedListMeetingTypes.mockResolvedValue(
      resolvedMeetingTypes([introCall, strategyCall]),
    )

    render(<BookingPage />)

    expect(
      screen.getByRole('heading', { name: 'Choose a meeting type' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'Intro call' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Get to know each other and see if we are a good fit.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('15 minutes')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Strategy call' }),
    ).toBeInTheDocument()
    expect(screen.getByText('60 minutes')).toBeInTheDocument()
  })

  it('shows a loading state while meeting types are being fetched', async () => {
    let resolveList!: (result: ApiResult<MeetingType[]>) => void
    mockedListMeetingTypes.mockReturnValue(
      new Promise((resolve) => {
        resolveList = resolve
      }),
    )

    render(<BookingPage />)

    expect(screen.getByText('Loading meeting types...')).toBeInTheDocument()

    resolveList(resolvedMeetingTypes([introCall]))

    expect(
      await screen.findByRole('heading', { name: 'Intro call' }),
    ).toBeInTheDocument()
  })

  it('shows an empty state when no meeting types exist', async () => {
    mockedListMeetingTypes.mockResolvedValue(resolvedMeetingTypes([]))

    render(<BookingPage />)

    expect(await screen.findByText('No meeting types yet')).toBeInTheDocument()
  })

  it('shows a load error and retries the request', async () => {
    mockedListMeetingTypes
      .mockResolvedValueOnce({
        data: null,
        error: {
          status: 500,
          code: 'internal_error',
          message: 'Internal server error',
        },
      })
      .mockResolvedValueOnce(resolvedMeetingTypes([introCall]))

    render(<BookingPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't load meeting types.",
    )

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(
      await screen.findByRole('heading', { name: 'Intro call' }),
    ).toBeInTheDocument()
  })

  it('shows a 14-day picker after selecting a meeting type', async () => {
    await selectIntroCall()

    expect(dayButtons()).toHaveLength(14)
    expect(screen.getByText('Intro call · 15 minutes')).toBeInTheDocument()
    expect(mockedGetAvailability).not.toHaveBeenCalled()
  })

  it('loads and shows the free slots of the selected day in Moscow time', async () => {
    await selectIntroCall()

    let resolveSlots!: (result: ApiResult<Slot[]>) => void
    mockedGetAvailability.mockReturnValue(
      new Promise((resolve) => {
        resolveSlots = resolve
      }),
    )

    fireEvent.click(dayButtons()[0])

    expect(screen.getByText('Loading available slots...')).toBeInTheDocument()
    expect(mockedGetAvailability).toHaveBeenCalledWith(
      1,
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    )

    resolveSlots(resolvedSlots(morningSlots))

    expect(
      await screen.findByRole('button', { name: '09:00' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '09:15' })).toBeInTheDocument()
  })

  it('shows an empty state when the selected day has no free slots', async () => {
    await selectIntroCall()
    mockedGetAvailability.mockResolvedValue(resolvedSlots([]))

    fireEvent.click(dayButtons()[0])

    expect(
      await screen.findByText('No free slots on this day'),
    ).toBeInTheDocument()
  })

  it('shows a load error for slots and retries', async () => {
    await selectIntroCall()
    mockedGetAvailability
      .mockResolvedValueOnce({
        data: null,
        error: {
          status: 500,
          code: 'internal_error',
          message: 'Internal server error',
        },
      })
      .mockResolvedValueOnce(resolvedSlots(morningSlots))

    fireEvent.click(dayButtons()[0])

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't load available slots.",
    )

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(
      await screen.findByRole('button', { name: '09:00' }),
    ).toBeInTheDocument()
  })

  it('explains when the selected date is out of range', async () => {
    await selectIntroCall()
    mockedGetAvailability.mockResolvedValue({
      data: null,
      error: {
        status: 400,
        code: 'date_out_of_range',
        message: 'Date is outside the booking horizon',
      },
    })

    fireEvent.click(dayButtons()[0])

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This date is outside the booking horizon. Pick another day.',
    )
  })

  it('returns to the meeting-type list when availability says the type is gone', async () => {
    await selectIntroCall()
    mockedGetAvailability.mockResolvedValue({
      data: null,
      error: {
        status: 404,
        code: 'meeting_type_not_found',
        message: 'Meeting type not found',
      },
    })

    fireEvent.click(dayButtons()[0])

    expect(
      await screen.findByText(/is no longer available/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Choose a meeting type' }),
    ).toBeInTheDocument()
    expect(mockedListMeetingTypes).toHaveBeenCalledTimes(2)
    expect(
      screen.queryByRole('list', { name: 'Available slots' }),
    ).not.toBeInTheDocument()
  })

  it('refreshes the day list when the owner date rolls over', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-11-09T20:00:00.000Z')) // 23:00 in Moscow

    try {
      await selectIntroCall()

      expect(dayButtons()[0]).toHaveTextContent('Mon 9 Nov')

      vi.setSystemTime(new Date('2026-11-10T13:00:00.000Z')) // 16:00 in Moscow
      await act(async () => {
        window.dispatchEvent(new Event('focus'))
      })

      expect(dayButtons()).toHaveLength(14)
      expect(dayButtons()[0]).toHaveTextContent('Tue 10 Nov')
      expect(dayButtons().at(-1)).toHaveTextContent('Mon 23 Nov')
    } finally {
      vi.useRealTimers()
    }
  })

  it('lets the guest go back and choose another meeting type', async () => {
    await selectIntroCall()

    fireEvent.click(screen.getByRole('button', { name: 'Change meeting type' }))

    expect(
      screen.getByRole('heading', { name: 'Choose a meeting type' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('list', { name: 'Available days' }),
    ).not.toBeInTheDocument()
  })

  it('allows selecting a slot', async () => {
    await selectIntroCall()
    mockedGetAvailability.mockResolvedValue(resolvedSlots(morningSlots))

    fireEvent.click(dayButtons()[0])
    fireEvent.click(await screen.findByRole('button', { name: '09:00' }))

    expect(screen.getByRole('button', { name: '09:00' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('reveals the guest form after a slot is chosen', async () => {
    await selectFirstSlot()

    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Comment (optional)')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Confirm booking' }),
    ).toBeInTheDocument()
    expect(screen.getByText('09:00–09:15 · Europe/Moscow')).toBeInTheDocument()
  })

  it('submits the booking and shows the confirmation details', async () => {
    await selectFirstSlot()
    mockedCreateBooking.mockResolvedValue({ data: createdBooking, error: null })

    fillGuestDetails()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm booking' }))

    expect(
      await screen.findByRole('heading', { name: 'Booking confirmed' }),
    ).toBeInTheDocument()
    expect(mockedCreateBooking).toHaveBeenCalledWith({
      meetingTypeId: introCall.id,
      startAt: morningSlots[0].startAt,
      guestName: 'Ada Lovelace',
      guestEmail: 'ada@example.com',
      comment: 'Looking forward to it.',
    })

    expect(screen.getByText('Intro call')).toBeInTheDocument()
    expect(screen.getByText('Tuesday, 10 November 2026')).toBeInTheDocument()
    expect(screen.getByText('09:00–09:15 · Europe/Moscow')).toBeInTheDocument()
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('ada@example.com')).toBeInTheDocument()
    expect(screen.getByText('Looking forward to it.')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Book another meeting' }),
    ).not.toBeInTheDocument()
  })

  it('renders field-level errors returned by the API next to the fields', async () => {
    await selectFirstSlot()
    mockedCreateBooking.mockResolvedValue({
      data: null,
      error: {
        status: 400,
        code: 'validation_failed',
        message: 'Request validation failed',
        details: {
          fields: [
            { field: 'guestName', message: 'This field is required.' },
            {
              field: 'guestEmail',
              message: 'Must be a valid email address.',
            },
          ],
        },
      },
    })

    fillGuestDetails({ name: '', email: 'not-an-email' })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm booking' }))

    expect(
      await screen.findByText('This field is required.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Must be a valid email address.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Email')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(screen.getByLabelText('Name')).toHaveValue('')
    expect(screen.getByLabelText('Email')).toHaveValue('not-an-email')
    expect(mockedCreateBooking).toHaveBeenCalledTimes(1)
  })

  it('on 409 clears the slot, explains the conflict and reloads availability', async () => {
    await selectFirstSlot()
    mockedGetAvailability.mockResolvedValueOnce(
      resolvedSlots(onlyRemainingSlot),
    )
    mockedCreateBooking.mockResolvedValue({
      data: null,
      error: {
        status: 409,
        code: 'slot_unavailable',
        message: 'The selected slot is no longer available',
      },
    })

    fillGuestDetails()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm booking' }))

    expect(
      await screen.findByText(/was just booked by someone else/i),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    expect(mockedGetAvailability).toHaveBeenCalledTimes(2)
    expect(mockedCreateBooking).toHaveBeenCalledTimes(1)

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: '09:00' }),
      ).not.toBeInTheDocument(),
    )
    expect(
      screen.getByRole('button', { name: '09:15' }),
    ).toBeInTheDocument()
  })

  it('on 404 returns to the meeting-type list with a message', async () => {
    await selectFirstSlot()
    mockedListMeetingTypes.mockResolvedValue(
      resolvedMeetingTypes([introCall, strategyCall]),
    )
    mockedCreateBooking.mockResolvedValue({
      data: null,
      error: {
        status: 404,
        code: 'meeting_type_not_found',
        message: 'Meeting type not found',
      },
    })

    fillGuestDetails()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm booking' }))

    expect(
      await screen.findByText(/is no longer available/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Choose a meeting type' }),
    ).toBeInTheDocument()
    expect(mockedListMeetingTypes).toHaveBeenCalledTimes(2)
    expect(mockedCreateBooking).toHaveBeenCalledTimes(1)
  })

  it('shows a pending state while the booking request is in flight', async () => {
    await selectFirstSlot()

    let resolveBooking!: (result: ApiResult<Booking>) => void
    mockedCreateBooking.mockReturnValue(
      new Promise((resolve) => {
        resolveBooking = resolve
      }),
    )

    fillGuestDetails()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm booking' }))

    expect(
      screen.getByRole('button', { name: 'Booking...' }),
    ).toBeDisabled()

    resolveBooking({ data: createdBooking, error: null })

    expect(
      await screen.findByRole('heading', { name: 'Booking confirmed' }),
    ).toBeInTheDocument()
  })

  it('keeps the entered data after a general error so the guest can retry', async () => {
    await selectFirstSlot()
    mockedCreateBooking.mockResolvedValue({
      data: null,
      error: {
        status: 500,
        code: 'internal_error',
        message: 'Internal server error',
      },
    })

    fillGuestDetails()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm booking' }))

    expect(
      await screen.findByText(/Something went wrong while booking/i),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Ada Lovelace')
    expect(screen.getByLabelText('Email')).toHaveValue('ada@example.com')
    expect(screen.getByLabelText('Comment (optional)')).toHaveValue(
      'Looking forward to it.',
    )
    expect(
      screen.getByRole('button', { name: 'Confirm booking' }),
    ).toBeEnabled()
    expect(mockedCreateBooking).toHaveBeenCalledTimes(1)
  })
})
