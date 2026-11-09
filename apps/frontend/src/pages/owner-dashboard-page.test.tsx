import { fireEvent, render, screen, within } from '@testing-library/react'
import type { Booking, MeetingType } from 'api-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMeetingType,
  listMeetingTypes,
  listUpcomingBookings,
  type ApiResult,
} from '@/lib/api'
import OwnerDashboardPage from './owner-dashboard-page'

vi.mock('@/lib/api', () => ({
  listMeetingTypes: vi.fn(),
  createMeetingType: vi.fn(),
  listUpcomingBookings: vi.fn(),
}))

const mockedListMeetingTypes = vi.mocked(listMeetingTypes)
const mockedCreateMeetingType = vi.mocked(createMeetingType)
const mockedListUpcomingBookings = vi.mocked(listUpcomingBookings)

const existingType: MeetingType = {
  id: 1,
  name: 'Intro call',
  description: 'Get to know each other.',
  durationMin: 15,
  createdAt: '2026-11-01T10:00:00.000Z',
}

const createdType: MeetingType = {
  id: 2,
  name: 'Strategy call',
  description: 'Plan the next quarter.',
  durationMin: 45,
  createdAt: '2026-11-02T10:00:00.000Z',
}

const earlierBooking: Booking = {
  id: 10,
  meetingTypeId: 1,
  meetingType: existingType,
  startAt: '2026-11-10T06:00:00.000Z',
  endAt: '2026-11-10T06:15:00.000Z',
  guestName: 'Ada Lovelace',
  guestEmail: 'ada@example.com',
  comment: 'Please call me on my mobile.',
  createdAt: '2026-11-01T10:00:00.000Z',
}

const laterBooking: Booking = {
  id: 11,
  meetingTypeId: 2,
  meetingType: createdType,
  startAt: '2026-11-10T09:30:00.000Z',
  endAt: '2026-11-10T10:15:00.000Z',
  guestName: 'Grace Hopper',
  guestEmail: 'grace@example.com',
  comment: null,
  createdAt: '2026-11-02T10:00:00.000Z',
}

function resolvedMeetingTypes(
  data: MeetingType[],
): ApiResult<MeetingType[]> {
  return { data, error: null }
}

function resolvedBookings(data: Booking[]): ApiResult<Booking[]> {
  return { data, error: null }
}

function fillCreateForm() {
  fireEvent.change(screen.getByLabelText('Name'), {
    target: { value: 'Strategy call' },
  })
  fireEvent.change(screen.getByLabelText('Description (optional)'), {
    target: { value: 'Plan the next quarter.' },
  })
  fireEvent.change(screen.getByLabelText('Duration (minutes)'), {
    target: { value: '45' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedListUpcomingBookings.mockResolvedValue(resolvedBookings([]))
})

describe('OwnerDashboardPage', () => {
  it('renders upcoming bookings with every field in the server order', async () => {
    mockedListMeetingTypes.mockResolvedValue(resolvedMeetingTypes([]))
    mockedListUpcomingBookings.mockResolvedValue(
      resolvedBookings([earlierBooking, laterBooking]),
    )

    render(<OwnerDashboardPage />)

    const list = await screen.findByRole('list', { name: 'Upcoming bookings' })
    const items = within(list).getAllByRole('listitem')

    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Intro call')
    expect(items[0]).toHaveTextContent('Tue 10 Nov 2026, 09:00')
    expect(items[0]).toHaveTextContent('Ada Lovelace')
    expect(items[0]).toHaveTextContent('ada@example.com')
    expect(items[0]).toHaveTextContent('Please call me on my mobile.')
    expect(items[1]).toHaveTextContent('Strategy call')
    expect(items[1]).toHaveTextContent('Tue 10 Nov 2026, 12:30')
    expect(items[1]).toHaveTextContent('Grace Hopper')
    expect(items[1]).toHaveTextContent('grace@example.com')
  })

  it('keeps the server-provided order instead of re-sorting client-side', async () => {
    mockedListMeetingTypes.mockResolvedValue(resolvedMeetingTypes([]))
    // Deliberately out of chronological order: the API is authoritative.
    mockedListUpcomingBookings.mockResolvedValue(
      resolvedBookings([laterBooking, earlierBooking]),
    )

    render(<OwnerDashboardPage />)

    const list = await screen.findByRole('list', { name: 'Upcoming bookings' })
    const items = within(list).getAllByRole('listitem')

    expect(items[0]).toHaveTextContent('Grace Hopper')
    expect(items[1]).toHaveTextContent('Ada Lovelace')
  })

  it('shows an empty state when nothing is upcoming', async () => {
    mockedListMeetingTypes.mockResolvedValue(resolvedMeetingTypes([]))

    render(<OwnerDashboardPage />)

    expect(
      await screen.findByText('No upcoming bookings yet'),
    ).toBeInTheDocument()
  })

  it('shows a loading state while bookings are being fetched', async () => {
    mockedListMeetingTypes.mockResolvedValue(resolvedMeetingTypes([]))
    let resolveBookings!: (result: ApiResult<Booking[]>) => void
    mockedListUpcomingBookings.mockReturnValue(
      new Promise((resolve) => {
        resolveBookings = resolve
      }),
    )

    render(<OwnerDashboardPage />)

    expect(screen.getByText('Loading bookings...')).toBeInTheDocument()

    resolveBookings(resolvedBookings([earlierBooking]))

    expect(
      await screen.findByRole('list', { name: 'Upcoming bookings' }),
    ).toBeInTheDocument()
  })

  it('shows a bookings load error and retries independently of meeting types', async () => {
    mockedListMeetingTypes.mockResolvedValue(resolvedMeetingTypes([]))
    mockedListUpcomingBookings
      .mockResolvedValueOnce({
        data: null,
        error: {
          status: 500,
          code: 'internal_error',
          message: 'Internal server error',
        },
      })
      .mockResolvedValueOnce(resolvedBookings([earlierBooking]))

    render(<OwnerDashboardPage />)

    expect(await screen.findByText(/Couldn't load bookings\./)).toBeInTheDocument()
    expect(
      screen.getByText('No meeting types yet'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    const list = await screen.findByRole('list', { name: 'Upcoming bookings' })
    expect(within(list).getByText('Ada Lovelace')).toBeInTheDocument()
  })

  it('renders bookings even when meeting types fail to load', async () => {
    mockedListMeetingTypes.mockResolvedValue({
      data: null,
      error: {
        status: 500,
        code: 'internal_error',
        message: 'Internal server error',
      },
    })
    mockedListUpcomingBookings.mockResolvedValue(
      resolvedBookings([earlierBooking]),
    )

    render(<OwnerDashboardPage />)

    const list = await screen.findByRole('list', { name: 'Upcoming bookings' })
    expect(within(list).getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText(/Couldn't load meeting types\./)).toBeInTheDocument()
  })

  it('creates a meeting type and shows it in the list immediately', async () => {
    mockedListMeetingTypes.mockResolvedValue(resolvedMeetingTypes([]))
    mockedCreateMeetingType.mockResolvedValue({
      data: createdType,
      error: null,
    })

    render(<OwnerDashboardPage />)
    await screen.findByText('No meeting types yet')
    fillCreateForm()

    fireEvent.click(
      screen.getByRole('button', { name: 'Create meeting type' }),
    )

    expect(
      await screen.findByRole('heading', { name: 'Strategy call' }),
    ).toBeInTheDocument()
    expect(mockedCreateMeetingType).toHaveBeenCalledWith({
      name: 'Strategy call',
      description: 'Plan the next quarter.',
      durationMin: 45,
    })
    expect(screen.getByLabelText('Name')).toHaveValue('')
  })

  it('keeps the submit button disabled while the request is pending', async () => {
    let resolveCreate!: (result: ApiResult<MeetingType>) => void
    mockedListMeetingTypes.mockResolvedValue(resolvedMeetingTypes([]))
    mockedCreateMeetingType.mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve
      }),
    )

    render(<OwnerDashboardPage />)
    await screen.findByText('No meeting types yet')
    fillCreateForm()

    fireEvent.click(
      screen.getByRole('button', { name: 'Create meeting type' }),
    )

    expect(
      screen.getByRole('button', { name: 'Creating...' }),
    ).toBeDisabled()

    resolveCreate({ data: createdType, error: null })

    expect(
      await screen.findByRole('heading', { name: 'Strategy call' }),
    ).toBeInTheDocument()
  })

  it('renders validation errors next to the matching fields', async () => {
    mockedListMeetingTypes.mockResolvedValue(resolvedMeetingTypes([]))
    mockedCreateMeetingType.mockResolvedValue({
      data: null,
      error: {
        status: 400,
        code: 'validation_failed',
        message: 'Request validation failed',
        details: {
          fields: [
            { field: 'name', message: 'This field is required.' },
            {
              field: 'durationMin',
              message: 'Must be between 5 and 240 minutes.',
            },
          ],
        },
      },
    })

    render(<OwnerDashboardPage />)
    await screen.findByText('No meeting types yet')

    fireEvent.click(
      screen.getByRole('button', { name: 'Create meeting type' }),
    )

    expect(
      await screen.findByText('This field is required.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Must be between 5 and 240 minutes.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(screen.getByLabelText('Duration (minutes)')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
  })

  it('shows a loading state while the list is being fetched', async () => {
    let resolveList!: (result: ApiResult<MeetingType[]>) => void
    mockedListMeetingTypes.mockReturnValue(
      new Promise((resolve) => {
        resolveList = resolve
      }),
    )

    render(<OwnerDashboardPage />)

    expect(screen.getByText('Loading meeting types...')).toBeInTheDocument()

    resolveList(resolvedMeetingTypes([existingType]))

    expect(
      await screen.findByRole('heading', { name: 'Intro call' }),
    ).toBeInTheDocument()
  })

  it('shows an empty state when no meeting types exist', async () => {
    mockedListMeetingTypes.mockResolvedValue(resolvedMeetingTypes([]))

    render(<OwnerDashboardPage />)

    expect(await screen.findByText('No meeting types yet')).toBeInTheDocument()
  })

  it('shows a load error and retries loading the list', async () => {
    mockedListMeetingTypes
      .mockResolvedValueOnce({
        data: null,
        error: {
          status: 500,
          code: 'internal_error',
          message: 'Internal server error',
        },
      })
      .mockResolvedValueOnce(resolvedMeetingTypes([existingType]))

    render(<OwnerDashboardPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't load meeting types.",
    )

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(
      await screen.findByRole('heading', { name: 'Intro call' }),
    ).toBeInTheDocument()
  })
})
