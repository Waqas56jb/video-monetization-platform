import { useEffect } from 'react'

/**
 * Freezes page scroll behind full-screen overlays (mobile menu, modals, drawer).
 *
 * Counted, not per-component — and that is the whole point.
 *
 * Each caller used to save the body's overflow, set it to hidden, and restore
 * what it saved. With one overlay that is correct. With two it leaks: the
 * second one opens while the first already has the body hidden, so what it
 * "saves" IS hidden — and when it closes it faithfully restores hidden. If the
 * first overlay had already gone by then, nothing was left to undo it and the
 * page could never scroll again. Nothing looked broken; the page had simply
 * stopped responding to a finger, which reads as the app hanging.
 *
 * A drawer with a modal over it, or a menu open while a route changes, is
 * enough to hit it. So the real value is captured once, on the first lock, and
 * put back once, when the last overlay closes.
 */
let locks = 0
let saved = null

export default function useLockBodyScroll(locked) {
  useEffect(() => {
    if (!locked) return

    if (locks === 0) {
      saved = {
        overflow: document.body.style.overflow,
        paddingRight: document.body.style.paddingRight,
      }
      // Desktop keeps the scrollbar's width so the page does not jump sideways
      // as it disappears. On a phone this is 0 and nothing happens.
      const gap = window.innerWidth - document.documentElement.clientWidth
      document.body.style.overflow = 'hidden'
      if (gap > 0) document.body.style.paddingRight = `${gap}px`
    }
    locks += 1

    return () => {
      locks = Math.max(0, locks - 1)
      if (locks === 0 && saved) {
        document.body.style.overflow = saved.overflow
        document.body.style.paddingRight = saved.paddingRight
        saved = null
      }
    }
  }, [locked])
}
