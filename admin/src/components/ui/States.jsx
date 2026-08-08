import { AlertTriangle, Inbox, RefreshCcw } from 'lucide-react'

/**
 * Loading, empty and error, in one place.
 *
 * A platform with no activity yet has to *look* like a platform with no
 * activity yet — an honest "nothing here" rather than a shrug or, worse, an
 * invented figure. These three states are what stand in for the sample data
 * that used to fill these screens.
 */

export function Skeleton({ height = 16, width = '100%', style }) {
  return <div className="sk" style={{ height, width, ...style }} />
}

export function SkeletonRows({ rows = 5 }) {
  return (
    <div className="sk-wrap">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={44} />
      ))}
    </div>
  )
}

export function EmptyState({ icon: Icon = Inbox, title, hint, action }) {
  return (
    <div className="state-block">
      <Icon size={26} />
      <b>{title}</b>
      {hint && <p>{hint}</p>}
      {action}
    </div>
  )
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="state-block bad">
      <AlertTriangle size={26} />
      <b>Something went wrong</b>
      <p>{message}</p>
      {onRetry && (
        <button className="btn btn-ghost btn-sm" onClick={onRetry}>
          <RefreshCcw />
          Try again
        </button>
      )}
    </div>
  )
}

/**
 * Render whichever of the three applies. Keeps every screen consistent instead
 * of each one improvising its own idea of "loading".
 */
export function Async({ loading, error, empty, onRetry, rows = 5, emptyProps, children }) {
  if (loading) return <SkeletonRows rows={rows} />
  if (error) return <ErrorState message={error} onRetry={onRetry} />
  if (empty) return <EmptyState {...emptyProps} />
  return children
}
