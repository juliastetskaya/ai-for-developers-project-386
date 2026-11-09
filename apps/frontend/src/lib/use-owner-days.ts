import { useEffect, useState } from 'react'
import {
  msUntilNextOwnerMidnight,
  ownerDays,
  type OwnerDay,
} from './owner-days'

/**
 * The 14-day horizon, refreshed whenever the owner calendar day can change:
 * on window focus, when the tab becomes visible again, and on a timer that
 * fires at the next owner-timezone midnight. This keeps a page that stays open
 * overnight from offering a day that is already in the past. The server remains
 * the final guard.
 */
export function useOwnerDays(): OwnerDay[] {
  const [days, setDays] = useState<OwnerDay[]>(() => ownerDays())

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined

    const refresh = () => {
      setDays(ownerDays())
    }

    const scheduleMidnightRefresh = () => {
      timer = setTimeout(() => {
        refresh()
        scheduleMidnightRefresh()
      }, msUntilNextOwnerMidnight())
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh()
      }
    }

    refresh()
    scheduleMidnightRefresh()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      if (timer !== undefined) {
        clearTimeout(timer)
      }
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return days
}
