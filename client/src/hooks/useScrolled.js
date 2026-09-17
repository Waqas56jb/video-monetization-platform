import { useEffect, useState } from 'react'

/**
 * Adds the `scrolled` header treatment past `offset` px (original threshold: 40).
 *
 * Measured, not assumed: this used to read `window.scrollY` inside a
 * requestAnimationFrame on every scroll event. Reading scrollY makes the
 * browser finish any pending layout right there, and on a phone scrolling
 * the homepage something is nearly always pending — a card's image just
 * mounted, a section just came into view. A DevTools trace of one scroll
 * down the homepage on a throttled Pixel 7 profile (2026-09-17) put 90
 * layout invalidations and 174ms of forced layout on this one function —
 * the single largest JavaScript cost of the whole scroll.
 *
 * A sentinel does the same job without reading anything: a 1px element
 * parked `offset` px from the top of the document, and an
 * IntersectionObserver that fires when it leaves the viewport. The browser
 * answers "is it on screen" from work it has already done for the frame.
 */
export default function useScrolled(offset = 40) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    if (typeof IntersectionObserver === 'undefined') {
      /* Very old browsers: the original listener, still rAF-throttled. */
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
    }

    const sentinel = document.createElement('div')
    sentinel.setAttribute('aria-hidden', 'true')
    sentinel.style.cssText = `position:absolute;top:${offset}px;left:0;width:1px;height:1px;pointer-events:none;visibility:hidden`
    document.body.appendChild(sentinel)

    const io = new IntersectionObserver(([entry]) => {
      /* Off screen AND above the viewport: the page has scrolled past it.
         (The observer reports the initial state on observe(), so a page
         that loads mid-scroll gets the right header straight away.) */
      setScrolled(!entry.isIntersecting && entry.boundingClientRect.top < 0)
    })
    io.observe(sentinel)

    return () => {
      io.disconnect()
      sentinel.remove()
    }
  }, [offset])

  return scrolled
}
