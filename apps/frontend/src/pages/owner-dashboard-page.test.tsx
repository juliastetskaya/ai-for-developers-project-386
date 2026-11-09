import { fireEvent, render, screen } from '@testing-library/react'
import type { MeetingType } from 'api-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMeetingType,
  listMeetingTypes,
  type ApiResult,
} from '@/lib/api'
import OwnerDashboardPage from './owner-dashboard-page'

vi.mock('@/lib/api', () => ({
  listMeetingTypes: vi.fn(),
  createMeetingType: vi.fn(),
}))

const mockedListMeetingTypes = vi.mocked(listMeetingTypes)
const mockedCreateMeetingType = vi.mocked(createMeetingType)

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

function resolvedMeetingTypes(
  data: MeetingType[],
): ApiResult<MeetingType[]> {
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
})

describe('OwnerDashboardPage', () => {
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
