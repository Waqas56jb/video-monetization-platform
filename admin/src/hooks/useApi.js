import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Fetch something from the API and keep the three states that always come with
 * it: loading, error, and the data itself.
 *
 * Every screen in here used to read from a file of invented rows, where none of
 * those states existed. Now that the figures are real, a screen has to be able
 * to say "still loading", "that failed", and "there is genuinely nothing yet" —
 * and mean each of them.
 *
 *   const { data, loading, error, reload } = useApi(() => api.admin.users(), [])
 */
export default function useApi(fetcher, deps = [], { skip = false } = {}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(!skip)
  const [error, setError] = useState(null)

  // Keep the latest fetcher without making it a dependency — otherwise an
  // inline arrow function re-triggers the request on every single render.
  const ref = useRef(fetcher)
  ref.current = fetcher

  const run = useCallback(
    async ({ quiet = false } = {}) => {
      if (skip) return
      if (!quiet) setLoading(true)
      try {
        const res = await ref.current()
        setData(res)
        setError(null)
        return res
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [skip, ...deps]
  )

  useEffect(() => {
    let alive = true
    if (skip) {
      setLoading(false)
      return
    }
    setLoading(true)
    ref
      .current()
      .then((res) => {
        if (!alive) return
        setData(res)
        setError(null)
      })
      .catch((err) => alive && setError(err.message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip, ...deps])

  return { data, loading, error, reload: run, setData }
}

/** Money, the way it is written in Tanzania. */
export const tzs = (n) =>
  'TZS ' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })

/** Big numbers, shortened for a stat card. */
export const compact = (n) => {
  const v = Number(n || 0)
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1) + 'M'
  if (v >= 1_000) return (v / 1_000).toFixed(v >= 10_000 ? 0 : 1) + 'K'
  return String(v)
}

export const shortDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export const dateTime = (iso) => (iso ? new Date(iso).toLocaleString() : '—')

export const timeAgo = (iso) => {
  if (!iso) return '—'
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return 'just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  if (secs < 604800) return `${Math.floor(secs / 86400)}d ago`
  return shortDate(iso)
}

/**
 * Wait for typing to settle before asking the server again.
 *
 * A search box that fires on every keystroke sends a request per letter and
 * then races them; the last one to arrive wins, which is not necessarily the
 * last one sent.
 */
export function useDebounced(value, ms = 300) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return settled
}
