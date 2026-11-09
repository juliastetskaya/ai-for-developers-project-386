import { fireEvent, render, screen, within } from '@testing-library/react'
import type { MeetingType, Slot } from 'api-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getAvailability,
  listMeetingTypes,
  type ApiResult,
 } from '@/lib/api'
import BookingPage from './booking-page'

vi.mock('@/lib/api', () => ({
  listMeetingTypes: vi.fn(),
  createMeetingType: vi.fn(),
  getAvailability: vi.fn(),
}))

const mockedListMeetingTypes = vi.mocked(listMeetingTypes)
const mockedGetAvailability = vi.mocked(getAvailability)

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
})
