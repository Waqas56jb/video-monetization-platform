import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * The original `go()` router jumped to the top on every screen change.
 * Hash links (#trending etc.) are left alone so in-page anchors still work.
 */
export default function ScrollToTop() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (hash) return
    window.scrollTo({ top: 0 })
  }, [pathname, hash])

  return null
}
