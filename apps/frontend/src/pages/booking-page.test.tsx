import { fireEvent, render, screen } from '@testing-library/react'
import type { MeetingType } from 'api-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listMeetingTypes, type ApiResult } from '@/lib/api'
import BookingPage from './booking-page'

vi.mock('@/lib/api', () => ({
  listMeetingTypes: vi.fn(),
  createMeetingType: vi.fn(),
}))

const mockedListMeetingTypes = vi.mocked(listMeetingTypes)

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

function resolvedMeetingTypes(
  data: MeetingType[],
): ApiResult<MeetingType[]> {
  return { data, error: null }
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
})
