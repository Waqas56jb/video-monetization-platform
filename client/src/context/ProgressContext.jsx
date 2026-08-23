import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import TopProgress from '@/components/ui/TopProgress'

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

  const value = useMemo(
    () => ({
      active,
      setActive,
      start: () => setActive(true),
      stop: () => setActive(false),
    }),
    [active]
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
