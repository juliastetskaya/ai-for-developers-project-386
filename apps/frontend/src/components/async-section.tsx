import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import type { LoadStatus } from '@/lib/load-status'

interface AsyncSectionProps {
  status: LoadStatus
  /** Text shown while the resource is loading. */
  loadingMessage: string
  /** Text shown when loading failed. */
  errorMessage: string
  /** Omit to render the error without a retry action. */
  onRetry?: () => void
  /** True when a successful load produced no items. */
  isEmpty: boolean
  emptyTitle: string
  emptyMessage: string
  /** Rendered only when the load succeeded and produced at least one item. */
  children: ReactNode
}

/**
 * Shared loading, load-error and empty states for the booking and owner pages.
 * The ready-with-items case renders the caller's list markup unchanged.
 */
export function AsyncSection({
  status,
  loadingMessage,
  errorMessage,
  onRetry,
  isEmpty,
  emptyTitle,
  emptyMessage,
  children,
}: AsyncSectionProps) {
  if (status === 'idle') {
    return null
  }

  if (status === 'loading') {
    return (
      <p role="status" className="text-muted-foreground">
        {loadingMessage}
      </p>
    )
  }

  if (status === 'error') {
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
      >
        <p>{errorMessage}</p>
        {onRetry && (
          <Button type="button" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    )
  }

  if (isEmpty) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <h3 className="font-medium">{emptyTitle}</h3>
        <p className="text-muted-foreground">{emptyMessage}</p>
      </div>
    )
  }

  return <>{children}</>
}
