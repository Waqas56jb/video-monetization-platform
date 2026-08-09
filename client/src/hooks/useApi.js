import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Fetch from the API and keep the three states that always come with it:
 * loading, error, and the data.
 *
 * Every screen used to read from a file of invented rows, where none of those
 * states existed. Now that the figures are real, a screen has to be able to say
 * "still loading", "that failed" and "there is genuinely nothing yet" — and
 * mean each of them.
 */
export default function useApi(fetcher, deps = [], { skip = false } = {}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(!skip)
  const [error, setError] = useState(null)

  // Keep the latest fetcher without making it a dependency, or an inline arrow
  // function would re-trigger the request on every render.
  const ref = useRef(fetcher)
  ref.current = fetcher

  const reload = useCallback(
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

  return { data, loading, error, reload, setData }
}

/** Wait for typing to settle before asking the server again. */
export function useDebounced(value, ms = 300) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return settled
}

/* ---------------------------------------------------------- formatting */

/** Money, the way it is written in Tanzania. */
export const tzs = (n) => 'TZS ' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })

/** Big numbers, shortened for a stat tile. */
export const compact = (n) => {
  const v = Number(n || 0)
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1) + 'M'
  if (v >= 1_000) return (v / 1_000).toFixed(v >= 10_000 ? 0 : 1) + 'K'
  return String(v)
}

export const duration = (secs) => {
  const s = Math.max(0, Math.floor(Number(secs) || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
    : `${m}:${String(r).padStart(2, '0')}`
}

export const shortDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export const timeAgo = (iso) => {
  if (!iso) return ''
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return 'just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  if (secs < 604800) return `${Math.floor(secs / 86400)}d ago`
  return shortDate(iso)
}

/** How long until a paid premiere opens up. */
export const daysUntil = (iso) => {
  if (!iso) return null
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
  return days > 0 ? days : 0
}

/** What to call each way of selling a video, in the viewer's language. */
export const ACCESS_LABEL = {
  ppv_forever: 'Pay once · yours forever',
  paid_premiere: 'Paid Premiere',
  free_with_ads: 'Free with ads',
}

export const ACCESS_SHORT = {
  ppv_forever: 'PPV',
  paid_premiere: 'Premiere',
  free_with_ads: 'Free',
}

export const ACCESS_PILL = {
  ppv_forever: 'ppv',
  paid_premiere: 'pend',
  free_with_ads: 'free',
}

export const priceLabel = (v) =>
  v?.accessType === 'free_with_ads' ? 'Free' : tzs(v?.priceTzs)
