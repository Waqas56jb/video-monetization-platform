import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Run an async function and expose {data, error, loading, reload}.
 *
 * Every screen that reads from the API uses this, so loading and failure look
 * the same everywhere instead of each page inventing its own behaviour.
 */
export default function useAsync(fn, deps = [], { immediate = true } = {}) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(immediate)
  const alive = useRef(true)
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  const run = useCallback(async (...args) => {
    setLoading(true)
    setError(null)
    try {
      const result = await fnRef.current(...args)
      if (alive.current) setData(result)
      return result
    } catch (err) {
      if (alive.current) setError(err)
      return null
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (immediate) run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, error, loading, reload: run, setData }
}
