import { Link, useLocation } from 'react-router-dom'

/**
 * The MTONYO+ lockup, as supplied.
 *
 * This was drawn in markup — a Play icon in a rounded square beside the word.
 * It is now the client's own artwork: the play mark, MTONYO+, the trademark
 * and the tagline, in one image. `logo-lockup.png` is their file with the
 * black padding trimmed off so it can be positioned; nothing inside it has
 * been altered or recoloured.
 *
 * `size` picks how much room it gets. The tagline is only legible above a
 * certain height, which is why the header and a sign-in page do not get the
 * same one.
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
export default function Logo({ to = '/', className = '', onClick, size = 'bar' }) {
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
      <img
        className={`logo-img is-${size}`}
        src="/logo-lockup.png"
        alt="MTONYO+"
        width={1559}
        height={364}
        /* Never lazy: it is the first thing on the page and the thing people
           look for to know where they are. */
        decoding="async"
      />
    </Link>
  )
}
