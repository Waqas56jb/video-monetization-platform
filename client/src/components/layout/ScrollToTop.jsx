import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Jump to the top on route changes. Hash links (#trending) scroll to the
 * section with a short smooth scroll — without forcing smooth on every wheel
 * tick via `html { scroll-behavior }`, which makes the whole site stutter.
 */
export default function ScrollToTop() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (hash) {
      const id = hash.replace('#', '')
      const el = id ? document.getElementById(id) : null
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [pathname, hash])

  return null
}
