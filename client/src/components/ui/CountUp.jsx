import { useEffect, useRef, useState } from 'react'
import useInView from '@/hooks/useInView'
import usePrefersReducedMotion from '@/hooks/usePrefersReducedMotion'
import useMediaQuery, { LOW_POWER } from '@/hooks/useMediaQuery'

/**
 * Animated number — the React version of `[data-count]` + `animCount()`.
 * Same easing (cubic ease-out), same 1800ms duration, same threshold (0.6).
 *
 * Not on a phone. Each of these runs a requestAnimationFrame loop that calls
 * setState on every frame for 1.8 seconds — around a hundred React renders per
 * counter, and there are three of them side by side in the hero, all triggered
 * by scrolling past. That is a hundred renders competing with the scroll itself,
 * on the device with the least to spare, at the exact moment the client
 * photographed the page stalling.
 *
 * The number is the point; watching it climb is not. On a phone it is simply
 * there.
 */
export default function CountUp({ to = 0, duration = 1800, className = '' }) {
  const target = Number.isFinite(Number(to)) ? Number(to) : 0
  const reduced = usePrefersReducedMotion()
  const lowPower = useMediaQuery(LOW_POWER)
  const still = reduced || lowPower
  const [ref, inView] = useInView({ threshold: 0.6, skip: still })
  const [value, setValue] = useState(still ? target : 0)
  const frame = useRef(0)

  useEffect(() => {
    if (!inView || still) {
      setValue(target)
      return
    }
    const t0 = performance.now()
    const step = (t) => {
      const p = Math.min((t - t0) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(Math.floor(target * eased))
      if (p < 1) frame.current = requestAnimationFrame(step)
    }
    frame.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame.current)
  }, [inView, still, target, duration])

  return (
    <span ref={ref} className={className}>
      {Number(value || 0).toLocaleString()}
    </span>
  )
}
