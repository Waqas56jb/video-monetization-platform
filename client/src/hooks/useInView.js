import { useEffect, useRef, useState } from 'react'

/**
 * Fires once when the element scrolls into view.
 * Mirrors the original IntersectionObserver + `unobserve` behaviour.
 */
export default function useInView({ threshold = 0.12, skip = false } = {}) {
  const ref = useRef(null)
  const [inView, setInView] = useState(skip)

  useEffect(() => {
    if (skip) {
      setInView(true)
      return
    }
    const el = ref.current
    if (!el) return

    // No IO support (very old browsers) → just show the content.
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setInView(true)
            io.unobserve(entry.target)
          }
        })
      },
      { threshold }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [threshold, skip])

  return [ref, inView]
}
