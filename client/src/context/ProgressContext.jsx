import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import TopProgress from '@/components/ui/TopProgress'

/** If a caller forgets stop(), the bar must not run forever. */
const FORCE_STOP_MS = 8000

const ProgressContext = createContext({
  active: false,
  setActive: () => {},
  start: () => {},
  stop: () => {},
})

export function useProgress() {
  return useContext(ProgressContext)
}

export function ProgressProvider({ children }) {
  const [active, setActive] = useState(false)
  const cap = useRef(null)

  const start = useCallback(() => {
    setActive(true)
    if (cap.current) clearTimeout(cap.current)
    cap.current = setTimeout(() => {
      cap.current = null
      setActive(false)
    }, FORCE_STOP_MS)
  }, [])

  const stop = useCallback(() => {
    if (cap.current) {
      clearTimeout(cap.current)
      cap.current = null
    }
    setActive(false)
  }, [])

  useEffect(() => () => {
    if (cap.current) clearTimeout(cap.current)
  }, [])

  const value = useMemo(
    () => ({
      active,
      setActive,
      start,
      stop,
    }),
    [active, start, stop]
  )

  return (
    <ProgressContext.Provider value={value}>
      <TopProgress active={active} />
      {children}
    </ProgressContext.Provider>
  )
}

export function useProgressBar(isRefetching) {
  const { setActive } = useProgress()
  useEffect(() => {
    setActive(Boolean(isRefetching))
    return () => setActive(false)
  }, [isRefetching, setActive])
}
