import { useEffect, useState } from 'react'

/** Adds the `scrolled` header treatment past `offset` px (original threshold: 40). */
export default function useScrolled(offset = 40) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > offset)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [offset])

  return scrolled
}
