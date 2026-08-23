import { useEffect, useRef } from 'react'

/**
 * Freezes page scroll behind full-screen overlays (mobile menu, modals, drawer).
 * When `delay` is true, lock runs after paint (rAF) so the overlay is visible first.
 */
let locks = 0
let saved = null

export default function useLockBodyScroll(locked, { delay = false } = {}) {
  const lockedRef = useRef(locked)
  lockedRef.current = locked

  useEffect(() => {
    if (!locked) return

    const apply = () => {
      if (!lockedRef.current) return
      if (locks === 0) {
        saved = {
          overflow: document.body.style.overflow,
          paddingRight: document.body.style.paddingRight,
        }
        const gap = window.innerWidth - document.documentElement.clientWidth
        document.body.style.overflow = 'hidden'
        if (gap > 0) document.body.style.paddingRight = `${gap}px`
      }
      locks += 1
    }

    let raf = 0
    if (delay) {
      raf = requestAnimationFrame(() => requestAnimationFrame(apply))
    } else {
      apply()
    }

    return () => {
      if (raf) cancelAnimationFrame(raf)
      locks = Math.max(0, locks - 1)
      if (locks === 0 && saved) {
        document.body.style.overflow = saved.overflow
        document.body.style.paddingRight = saved.paddingRight
        saved = null
      }
    }
  }, [locked, delay])
}
