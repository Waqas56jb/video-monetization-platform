import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import TopProgress from '@/components/ui/TopProgress'

/** If a caller forgets stop(), the bar must not run forever. */
const FORCE_STOP_MS = 8000

const ProgressContext = createContext({
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

  /**
   * Actions only, and the same object for the life of the provider.
   *
   * `active` used to be in here, which meant the context value was a new object
   * every time the bar switched on or off — and every consumer re-rendered with
   * it. The consumers are the route watcher, the watch page and *every video
   * card on screen*, so starting the bar on a card tap re-rendered the whole
   * grid before the navigation had even begun: two dozen cards' worth of work
   * between the finger going down and anything happening. That is the tap that
   * feels dead.
   *
   * Nothing reads `active` through the context — the bar itself is rendered
   * here and takes it as a prop — so removing it costs nothing and makes every
   * consumer render-stable.
   */
  const value = useMemo(() => ({ setActive, start, stop }), [start, stop])

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
