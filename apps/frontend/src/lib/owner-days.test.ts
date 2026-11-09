import { describe, expect, it } from 'vitest'
import {
  BOOKING_HORIZON_DAYS,
  formatOwnerDayHeading,
  formatOwnerDateTime,
  formatOwnerTime,
  ownerDateOf,
  ownerDays,
} from './owner-days'

describe('ownerDays', () => {
  it('starts today in Moscow and spans 14 calendar days', () => {
    // 22:30 UTC is already the next day in Moscow (UTC+3).
    const days = ownerDays(new Date('2026-11-09T22:30:00.000Z'))

    expect(days).toHaveLength(BOOKING_HORIZON_DAYS)
    expect(days[0]).toMatchObject({
      date: '2026-11-10',
      label: 'Tue 10 Nov',
      isToday: true,
    })
    expect(days.at(-1)).toMatchObject({
      date: '2026-11-23',
      isToday: false,
    })
  })

  it('uses the Moscow day even when UTC is still on the previous day', () => {
    const days = ownerDays(new Date('2026-11-09T20:00:00.000Z'))

    expect(days[0]).toMatchObject({
      date: '2026-11-09',
      label: 'Mon 9 Nov',
      isToday: true,
    })
  })
})

describe('formatOwnerTime', () => {
  it.each([
    ['2026-11-10T06:00:00.000Z', '09:00'],
    ['2026-11-10T14:30:00.000Z', '17:30'],
    ['2026-11-10T15:00:00.000Z', '18:00'],
  ])('formats %s as %s in Moscow', (iso, expected) => {
    expect(formatOwnerTime(iso)).toBe(expected)
  })
})

describe('formatOwnerDateTime', () => {
  it.each([
    ['2026-11-10T06:00:00.000Z', 'Tue 10 Nov 2026, 09:00'],
    ['2026-11-10T21:30:00.000Z', 'Wed 11 Nov 2026, 00:30'],
  ])('formats %s as %s in Moscow', (iso, expected) => {
    expect(formatOwnerDateTime(iso)).toBe(expected)
  })
})

describe('formatOwnerDayHeading', () => {
  it('formats the selected day in the owner timezone', () => {
    expect(formatOwnerDayHeading('2026-11-10')).toBe(
      'Tuesday, 10 November 2026',
    )
  })
})

describe('ownerDateOf', () => {
  it('maps a UTC instant to the Moscow calendar date', () => {
    expect(ownerDateOf('2026-11-09T22:30:00.000Z')).toBe('2026-11-10')
    expect(ownerDateOf('2026-11-10T06:00:00.000Z')).toBe('2026-11-10')
  })
})
