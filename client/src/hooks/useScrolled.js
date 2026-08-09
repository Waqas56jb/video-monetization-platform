import { useEffect, useState } from 'react'

/** Adds the `scrolled` header treatment past `offset` px (original threshold: 40). */
export default function useScrolled(offset = 40) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    let ticking = false
    let last = false

    const update = () => {
      ticking = false
      const next = window.scrollY > offset
      if (next !== last) {
        last = next
        setScrolled(next)
      }
    }

    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [offset])

  return scrolled
}
