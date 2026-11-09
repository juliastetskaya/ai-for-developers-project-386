import { Fragment } from 'react'
import { buildCalendarMonths, WEEKDAY_LABELS } from '@/lib/booking-calendar'
import type { OwnerDay } from '@/lib/owner-days'

interface BookingCalendarProps {
  days: OwnerDay[]
  selectedDate: string | null
  onSelect: (date: string) => void
}

function BookingCalendar({
  days,
  selectedDate,
  onSelect,
}: BookingCalendarProps) {
  const months = buildCalendarMonths(days)

  return (
    <ul aria-label="Available days" className="grid grid-cols-7 gap-1 sm:gap-2">
      {months.map((month) => (
        <Fragment key={month.key}>
          <li className="col-span-7 pt-2 first:pt-0">
            <p className="text-sm font-medium">{month.label}</p>
          </li>
          {WEEKDAY_LABELS.map((weekday) => (
            <li
              key={`${month.key}-${weekday}`}
              aria-hidden="true"
              className="pb-1 text-center text-xs font-medium text-muted-foreground"
            >
              {weekday}
            </li>
          ))}
          {month.weeks.flat().map((day, index) =>
            day === null ? (
              <li key={`${month.key}-blank-${index}`} aria-hidden="true" />
            ) : (
              <li key={day.date}>
                {day.isSelectable ? (
                  <button
                    type="button"
                    aria-pressed={selectedDate === day.date}
                    aria-label={day.isToday ? `${day.label}, today` : day.label}
                    onClick={() => onSelect(day.date)}
                    className={`flex h-9 w-full items-center justify-center rounded-md border text-sm transition-colors hover:bg-muted aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground ${
                      day.isToday && selectedDate !== day.date
                        ? 'border-primary/40 font-semibold text-primary'
                        : 'border-transparent'
                    }`}
                  >
                    {day.dayOfMonth}
                  </button>
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-full items-center justify-center text-sm text-muted-foreground/40"
                  >
                    {day.dayOfMonth}
                  </span>
                )}
              </li>
            ),
          )}
        </Fragment>
      ))}
    </ul>
  )
}

export default BookingCalendar
