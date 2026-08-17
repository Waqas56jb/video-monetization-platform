import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

/**
 * A nav link that points at a section of the landing page, and works from
 * anywhere.
 *
 * Two things were wrong with a plain `<a href="#trending">`, and the client hit
 * both:
 *
 *  1. Those sections only exist on the landing page. From /explore — or a watch
 *     page, or the dashboard — the link had nothing to jump to, so clicking it
 *     highlighted the label and did nothing else. The client's exact report was
 *     that the menu item changed but the page did not.
 *
 *  2. Even on the landing page it could do nothing, because the page holds
 *     content back until it has booted. A click landing before the section
 *     mounts finds no element and silently gives up.
 *
 * So: leave for the landing page when we are not on it, then wait for the
 * section to actually exist before scrolling to it. `scrollIntoView` rather than
 * a hash jump, because the header is fixed and a raw jump puts the heading
 * underneath it.
 */

/**
 * Wait for a section to exist, scroll to it, and make sure it stayed there.
 *
 * The re-checks are not paranoia. This page loads its images lazily, so the
 * content above the target keeps growing for a second or two after the scroll
 * starts — which either drags the section away from the top or, with smooth
 * scrolling, cancels the animation outright and leaves the viewer where they
 * were. Landing near the section and then correcting is what makes the link feel
 * reliable rather than intermittent.
 */
/**
 * Where a correctly-scrolled section should end up.
 *
 * `scrollIntoView({block:'start'})` parks the target at the scrollport's
 * `scroll-padding-top`, so that — not zero — is the resting position. The drift
 * check used to compare against a hard-coded 90px, which happened to sit one
 * pixel either side of the real value; a small change to the header height
 * would have turned every successful scroll into a re-scroll loop. Reading the
 * computed value keeps the check honest whatever the header does.
 */
function restingTop() {
  const raw = getComputedStyle(document.documentElement).scrollPaddingTop
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) ? n : 0
}

function scrollWhenReady(id, { attempts = 60, gap = 100 } = {}) {
  let tries = 0

  const settle = (el, round = 0) => {
    el.scrollIntoView({ behavior: round === 0 ? 'smooth' : 'auto', block: 'start' })
    if (round >= 3) return
    setTimeout(() => {
      const drift = el.getBoundingClientRect().top - restingTop()
      // Anything more than a heading's worth of drift means the layout moved
      // underneath us — lazy images above the target finishing, usually.
      if (Math.abs(drift) > 24) settle(el, round + 1)
    }, round === 0 ? 700 : 450)
  }

  const tick = () => {
    const el = document.getElementById(id)
    if (el) return settle(el)
    if (++tries < attempts) setTimeout(tick, gap)
  }
  tick()
}

export default function useSectionLink() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  return useCallback(
    (id, e) => {
      e?.preventDefault?.()
      const onLanding = pathname === '/'

      if (!onLanding) {
        // Carry the section in the URL so a shared link lands in the right
        // place too. Do not scroll here — this page has no such section, and
        // polling on Watch/Explore while the homepage is still mounting is
        // what left people on a black hero. Landing + ScrollToTop wait until
        // the heading exists, then park it below the sticky header.
        navigate(`/#${id}`)
        return
      }

      // Keep the address bar honest without letting the browser do the jumping.
      if (window.history?.replaceState) {
        window.history.replaceState(null, '', `#${id}`)
      }
      scrollWhenReady(id)
    },
    [navigate, pathname]
  )
}

export { scrollWhenReady }
