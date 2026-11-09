import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useOwnerDays } from './use-owner-days'

afterEach(() => {
  vi.useRealTimers()
})

describe('useOwnerDays', () => {
  it('refreshes the list on window focus after the owner date changes', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-09T20:00:00.000Z')) // 23:00 in Moscow

    const { result } = renderHook(() => useOwnerDays())

    expect(result.current[0].date).toBe('2026-11-09')

    vi.setSystemTime(new Date('2026-11-10T13:00:00.000Z')) // 16:00 in Moscow
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    expect(result.current).toHaveLength(14)
    expect(result.current[0].date).toBe('2026-11-10')
    expect(result.current.at(-1)?.date).toBe('2026-11-23')
  })

  it('refreshes the list on the timer at the next owner midnight', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-09T20:00:00.000Z')) // 23:00 in Moscow

    const { result } = renderHook(() => useOwnerDays())

    act(() => {
      vi.advanceTimersByTime(60 * 60 * 1000)
    })

    expect(result.current[0].date).toBe('2026-11-10')
  })
})
