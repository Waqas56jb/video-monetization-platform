import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react'

/** Skeleton blocks, so a slow connection shows shape rather than a blank page. */
export function Skeleton({ rows = 3, className = '' }) {
  return (
    <div className={`skeleton-wrap ${className}`.trim()} aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <div className="skeleton" key={i} />
      ))}
    </div>
  )
}

export function SkeletonCards({ count = 4 }) {
  return (
    <div className="vid-grid" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <div className="skeleton-card" key={i}>
          <div className="skeleton skeleton-thumb" />
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line short" />
        </div>
      ))}
    </div>
  )
}

/** Nothing here yet — said plainly, with a way forward when there is one. */
export function EmptyState({ icon: Icon = Inbox, title, message, action }) {
  return (
    <div className="state-block">
      <Icon />
      <b>{title}</b>
      {message && <p>{message}</p>}
      {action}
    </div>
  )
}

/**
 * Something failed — say what, and offer to try again.
 *
 * Accepts either an Error or a plain string, because half the call sites hold
 * one and half hold the other, and a component that silently renders
 * "Something went wrong" when handed the wrong shape hides the very message
 * that would have explained the problem.
 */
/**
 * Messages this app writes are written for people. Anything that looks like it
 * came from a library, a driver or a stack is not, and showing it helps nobody
 * — it only worries them. Those are replaced with something true and useful.
 */
const TECHNICAL = /(fetch failed|networkerror|econn|etimedout|enotfound|unexpected token|<!doctype|json\.parse|500|502|503|undefined is not|cannot read propert|cannot reach the api|failed to fetch)/i

function readable(raw) {
  if (!raw || typeof raw !== 'string') return 'Something went wrong. Please try again.'
  if (TECHNICAL.test(raw)) {
    return 'We could not reach the server just now. Check your connection and try again.'
  }
  return raw
}

export function ErrorState({ error, message, onRetry, title = 'Could not load this' }) {
  const text = readable(
    (typeof error === 'string' ? error : error?.message) ||
      (typeof message === 'string' ? message : message?.message)
  )
  return (
    <div className="state-block state-error">
      <AlertTriangle />
      <b>{title}</b>
      <p>{text}</p>
      {onRetry && (
        <button className="btn btn-ghost" onClick={onRetry}>
          <RefreshCw />
          Try again
        </button>
      )}
    </div>
  )
}

/**
 * The usual three-way render: loading, failed, or ready.
 * `isEmpty` keeps the "no data yet" case out of every component.
 */
export function Async({ loading, error, onRetry, isEmpty, empty, skeleton, children }) {
  if (loading) return skeleton || <Skeleton />
  if (error) return <ErrorState error={error} onRetry={onRetry} />
  if (isEmpty) {
    return (
      empty || (
        <EmptyState
          title="Nothing here yet"
          message="This fills in as soon as there is something to show."
        />
      )
    )
  }
  return children
}
