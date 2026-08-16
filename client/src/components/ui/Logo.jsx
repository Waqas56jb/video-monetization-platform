import { Link, useLocation } from 'react-router-dom'
import { Play } from 'lucide-react'

/**
 * The MTONYO+ wordmark.
 *
 * The "+" is the single brand accent — when the client sends the final logo
 * artwork, swap the <span className="logo-mark"> block for an <img> and the
 * rest of the layout keeps working unchanged.
 */

/**
 * Clicking the logo has to *do* something, even when it cannot navigate.
 *
 * A plain `<Link to="/">` is a no-op when you are already on `/`: React Router
 * compares the target with the current location, finds them identical, and
 * fires nothing — so no navigation, and `ScrollToTop` never runs. On the
 * landing page that is exactly where people click it, halfway down after using
 * the section nav, and the reported symptom was the logo appearing dead.
 *
 * The section nav makes it worse. It records the section with
 * `history.replaceState`, which the browser honours but React Router never
 * hears about, so Router's own location still says "no hash" while the address
 * bar says `/#features`. Even a hash-aware comparison would conclude there was
 * nothing to do.
 *
 * So when the logo is already pointing at the page we are on, it takes the job
 * itself: strip whatever section the address bar is holding and return to the
 * top. Everywhere else it stays an ordinary link — real href, middle-click and
 * open-in-new-tab intact.
 */
export default function Logo({ to = '/', className = '', onClick }) {
  const { pathname } = useLocation()

  const handleClick = (e) => {
    onClick?.(e)
    if (e.defaultPrevented) return
    // Let the browser have modified clicks — new tab, new window, download.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    if (pathname !== to) return

    e.preventDefault()
    if (window.history?.replaceState && window.location.hash) {
      window.history.replaceState(null, '', to)
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' })
  }

  return (
    <Link
      className={`logo ${className}`.trim()}
      to={to}
      onClick={handleClick}
      aria-label="MTONYO+ home"
    >
      <span className="logo-mark">
        <Play />
      </span>
      <span className="logo-word">
        MTONYO<span className="logo-plus">+</span>
      </span>
    </Link>
  )
}
