import { useEffect, useRef, useState } from 'react'
import useInView from '@/hooks/useInView'
import usePrefersReducedMotion from '@/hooks/usePrefersReducedMotion'

/**
 * Animated number — the React version of `[data-count]` + `animCount()`.
 * Same easing (cubic ease-out), same 1800ms duration, same threshold (0.6).
 */
export default function CountUp({ to, duration = 1800, className = '' }) {
  const reduced = usePrefersReducedMotion()
  const [ref, inView] = useInView({ threshold: 0.6, skip: reduced })
  const [value, setValue] = useState(reduced ? to : 0)
  const frame = useRef(0)

  useEffect(() => {
    if (!inView || reduced) return
    const t0 = performance.now()
    const step = (t) => {
      const p = Math.min((t - t0) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(Math.floor(to * eased))
      if (p < 1) frame.current = requestAnimationFrame(step)
    }
    frame.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame.current)
  }, [inView, reduced, to, duration])

  return (
    <span ref={ref} className={className}>
      {value.toLocaleString()}
    </span>
  )
}
