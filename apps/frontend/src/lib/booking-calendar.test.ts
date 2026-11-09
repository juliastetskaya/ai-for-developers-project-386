import { describe, expect, it } from 'vitest'
import { buildCalendarMonths, WEEKDAY_LABELS } from './booking-calendar'
import { ownerDays } from './owner-days'

const NOON_UTC = new Date('2026-11-09T12:00:00.000Z')

function selectableDates(months: ReturnType<typeof buildCalendarMonths>) {
  return months
    .flatMap((month) => month.weeks.flat())
    .filter((day) => day !== null && day.isSelectable)
    .map((day) => day!.date)
}

describe('buildCalendarMonths', () => {
  it('lays a single-month horizon out as Monday-first weeks', () => {
    const days = ownerDays(NOON_UTC)
    const months = buildCalendarMonths(days)

    expect(months).toHaveLength(1)
    expect(months[0].key).toBe('2026-11')
    expect(months[0].label).toBe('November 2026')
    for (const week of months[0].weeks) {
      expect(week).toHaveLength(7)
    }
    // 1 November 2026 is a Sunday: Monday-first grid has six leading blanks.
    expect(months[0].weeks[0].slice(0, 6)).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
    ])
    expect(WEEKDAY_LABELS).toHaveLength(7)
  })

  it('keeps exactly the 14 horizon days selectable', () => {
    const days = ownerDays(NOON_UTC)
    const months = buildCalendarMonths(days)

    expect(selectableDates(months)).toEqual(days.map((day) => day.date))
    expect(months.flatMap((month) => month.weeks.flat())).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ date: '2026-11-01', isSelectable: false }),
        expect.objectContaining({ date: '2026-11-09', isSelectable: true }),
        expect.objectContaining({ date: '2026-11-22', isSelectable: true }),
        expect.objectContaining({ date: '2026-11-23', isSelectable: false }),
      ]),
    )
  })

  it('marks today in the owner timezone', () => {
    const months = buildCalendarMonths(ownerDays(NOON_UTC))
    const today = months
      .flatMap((month) => month.weeks.flat())
      .find((day) => day?.date === '2026-11-09')

    expect(today).toMatchObject({
      dayOfMonth: 9,
      label: 'Mon 9 Nov',
      isToday: true,
      isSelectable: true,
    })
  })

  it('splits a horizon crossing a month boundary into two months', () => {
    const months = buildCalendarMonths(
      ownerDays(new Date('2026-11-25T12:00:00.000Z')),
    )

    expect(months.map((month) => month.key)).toEqual(['2026-11', '2026-12'])
    expect(selectableDates(months)).toHaveLength(14)
    expect(selectableDates(months)[0]).toBe('2026-11-25')
    expect(selectableDates(months).at(-1)).toBe('2026-12-08')
  })

  it('returns no months without horizon days', () => {
    expect(buildCalendarMonths([])).toEqual([])
  })
})
