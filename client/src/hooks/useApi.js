import { useCallback, useEffect, useRef, useState } from 'react'

const FETCH_TIMEOUT_MS = 10_000

function withTimeout(promise, ms = FETCH_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('No connection — tap to retry'))
    }, ms)
    Promise.resolve(promise)
      .then((v) => {
        clearTimeout(timer)
        resolve(v)
      })
      .catch((err) => {
        clearTimeout(timer)
        if (err?.name === 'AbortError') {
          reject(new Error('No connection — tap to retry'))
          return
        }
        reject(err)
      })
  })
}

/**
 * Fetch from the API and keep the three states that always come with it:
 * loading, error, and the data.
 */
export default function useApi(fetcher, deps = [], { skip = false, keepPreviousData = false, timeoutMs = FETCH_TIMEOUT_MS } = {}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(!skip)
  const [isRefetching, setIsRefetching] = useState(false)
  const [error, setError] = useState(null)

  const ref = useRef(fetcher)
  ref.current = fetcher
  const dataRef = useRef(data)
  dataRef.current = data

  const runFetch = useCallback(
    async ({ quiet = false } = {}) => {
      if (skip) return
      const hasPrevious = keepPreviousData && dataRef.current != null
      if (!quiet && !hasPrevious) setLoading(true)
      if (hasPrevious) setIsRefetching(true)
      try {
        const res = await withTimeout(ref.current(), timeoutMs)
        setData(res)
        setError(null)
        return res
      } catch (err) {
        setError(err?.message || 'Something went wrong')
        throw err
      } finally {
        setLoading(false)
        setIsRefetching(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [skip, keepPreviousData, timeoutMs, ...deps]
  )

  const reload = useCallback(
    (opts) =>
      runFetch(opts).catch(() => {
        /* caller may handle */
      }),
    [runFetch]
  )

  useEffect(() => {
    let alive = true
    if (skip) {
      setLoading(false)
      return
    }
    const hasPrevious = keepPreviousData && dataRef.current != null
    if (!hasPrevious) setLoading(true)
    else setIsRefetching(true)

    withTimeout(ref.current(), timeoutMs)
      .then((res) => {
        if (!alive) return
        setData(res)
        setError(null)
      })
      .catch((err) => alive && setError(err?.message || 'Something went wrong'))
      .finally(() => {
        if (!alive) return
        setLoading(false)
        setIsRefetching(false)
      })

    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip, keepPreviousData, timeoutMs, ...deps])

  return { data, loading, error, isRefetching, reload, setData }
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

export const tzs = (n) => 'TZS ' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })

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

export const daysUntil = (iso) => {
  if (!iso) return null
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
  return days > 0 ? days : 0
}

export const ACCESS_LABEL = {
  ppv_forever: 'Pay Once',
  paid_premiere: 'Paid Premiere',
  free_with_ads: 'Free + Ads',
}

export const ACCESS_SHORT = {
  ppv_forever: 'Pay Once',
  paid_premiere: 'Premiere',
  free_with_ads: 'Free + Ads',
}

export const ACCESS_PILL = {
  ppv_forever: 'ppv',
  paid_premiere: 'pend',
  free_with_ads: 'free',
}

export const priceLabel = (v) =>
  v?.accessType === 'free_with_ads' ? 'Free' : tzs(v?.priceTzs)
