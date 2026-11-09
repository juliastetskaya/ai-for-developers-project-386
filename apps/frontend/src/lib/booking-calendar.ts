import { DateTime } from 'luxon'
import { OWNER_TIMEZONE, type OwnerDay } from './owner-days'

const LOCALE = 'en'
const MONTH_FORMAT = 'LLLL yyyy'
const DAY_LABEL_FORMAT = 'ccc d LLL'

export const WEEKDAY_LABELS = [
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
  'Sun',
] as const

export interface CalendarDay {
  /** Calendar date in the owner timezone, formatted as YYYY-MM-DD. */
  date: string
  dayOfMonth: number
  /** Human-readable label such as "Tue 10 Nov". */
  label: string
  isToday: boolean
  /** Only dates inside the 14-day booking horizon are clickable. */
  isSelectable: boolean
}

export interface CalendarMonth {
  /** Month key formatted as YYYY-MM. */
  key: string
  /** Month heading such as "November 2026". */
  label: string
  /** Weeks of seven cells; `null` pads the first and last week. */
  weeks: Array<Array<CalendarDay | null>>
}

/**
 * Lays the 14-day horizon out as one or two conventional month grids.
 *
 * Dates outside the horizon stay visible but are not selectable, so the
 * calendar keeps its familiar month shape without offering days the API would
 * reject.
 */
export function buildCalendarMonths(days: OwnerDay[]): CalendarMonth[] {
  if (days.length === 0) {
    return []
  }

  const daysByDate = new Map(days.map((day) => [day.date, day]))
  const monthKeys = [...new Set(days.map((day) => day.date.slice(0, 7)))]

  return monthKeys.map((monthKey) => {
    const monthStart = DateTime.fromISO(`${monthKey}-01`, {
      zone: OWNER_TIMEZONE,
    })
    const cells: Array<CalendarDay | null> = []

    // Luxon uses Monday = 1, matching the calendar's weekday headers.
    for (let index = 1; index < monthStart.weekday; index += 1) {
      cells.push(null)
    }

    const daysInMonth = monthStart.daysInMonth ?? 0
    for (let dayOfMonth = 1; dayOfMonth <= daysInMonth; dayOfMonth += 1) {
      const date = `${monthKey}-${String(dayOfMonth).padStart(2, '0')}`
      const ownerDay = daysByDate.get(date)

      cells.push({
        date,
        dayOfMonth,
        label:
          ownerDay?.label ??
          monthStart
            .set({ day: dayOfMonth })
            .toFormat(DAY_LABEL_FORMAT, { locale: LOCALE }),
        isToday: ownerDay?.isToday ?? false,
        isSelectable: ownerDay !== undefined,
      })
    }

    while (cells.length % 7 !== 0) {
      cells.push(null)
    }

    const weeks: Array<Array<CalendarDay | null>> = []
    for (let index = 0; index < cells.length; index += 7) {
      weeks.push(cells.slice(index, index + 7))
    }

    return {
      key: monthKey,
      label: monthStart.toFormat(MONTH_FORMAT, { locale: LOCALE }),
      weeks,
    }
  })
}
