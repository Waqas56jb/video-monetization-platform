import { useEffect, useState } from 'react'

/**
 * Does this device match a media query, right now?
 *
 * Used to decide in JavaScript what CSS already decides in `@media` — chiefly
 * whether to run scroll animations at all. Overriding an animation in CSS still
 * leaves its observers, its class changes and its layers behind; not starting it
 * is the only version that actually costs nothing.
 */
export default function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.(query).matches === true
  )

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia(query)
    const onChange = (e) => setMatches(e.matches)
    setMatches(mq.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [query])

  return matches
}

/**
 * A phone, a tablet, or anything driven by a finger.
 *
 * The threshold that decides whether this page animates on scroll. It matches
 * the CSS block that strips the same work, so the two can never disagree about
 * which devices are being spared.
 */
export const LOW_POWER = '(max-width: 1024px), (hover: none)'
