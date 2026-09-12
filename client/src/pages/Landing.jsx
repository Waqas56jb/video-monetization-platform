import { lazy, Suspense, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { scrollWhenReady } from '@/hooks/useSectionLink'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import Hero from '@/components/landing/Hero'
import Marquee from '@/components/landing/Marquee'
import ContinueWatching from '@/components/landing/ContinueWatching'
import Trending from '@/components/landing/Trending'
import HowItWorks from '@/components/landing/HowItWorks'
import AccessModels from '@/components/landing/AccessModels'
import Features from '@/components/landing/Features'
import ForCreators from '@/components/landing/ForCreators'
import Testimonials from '@/components/landing/Testimonials'
import CallToAction from '@/components/landing/CallToAction'

/**
 * Its own chunk, loaded after the page's critical content, not before it.
 *
 * Measured live (report2.txt SEP12 §B/C): with this section statically
 * imported and mounted ahead of Trending, iPhone cold first-card time went
 * from a 2502ms baseline to a 6693ms median — the section's own render cost
 * (4 steps, 4 tiles, a status card, a trust row, a dozen icons) was
 * delaying React's pass over everything after it in the tree, Trending's
 * cards included, even though the section makes no API call of its own for
 * a signed-out visitor. `lazy` + `Suspense` moves its download and its
 * render off the critical path — React 18's concurrent renderer does not
 * block a Suspense boundary's siblings on that boundary resolving, so
 * Trending renders on the first pass regardless of when this chunk arrives.
 */
const CreatorCapital = lazy(() => import('@/components/landing/CreatorCapital'))

/**
 * Marketing homepage.
 *
 * No boot splash. A black overlay that then reveals the page is the first-load
 * jump the client reported — one layout, then another. The page paints as
 * itself from the first frame.
 */
export default function Landing() {
  const { hash } = useLocation()

  /**
   * Arriving at /#features — from another page, or from a shared link — has to
   * land on that section.
   *
   * The browser's own hash jump happens before this page has rendered its
   * sections, so it finds nothing and leaves the viewer at the top. Waiting for
   * the element to exist is the difference between the link working and the link
   * appearing to do nothing at all, which is what the client reported.
   */
  useEffect(() => {
    const id = hash?.replace('#', '')
    if (id) scrollWhenReady(id)
  }, [hash])

  return (
    <div className="page landing-page is-ready">
      <Header />
      <Hero />
      <Marquee />
      {/* Above Trending, and only for a signed-in viewer with something to
          continue. It renders nothing otherwise, so the page is unchanged for
          everybody else. */}
      <ContinueWatching />
      {/* Immediately before Trending, per the Sep 09 mockup (report2.txt §3)
          — was after ForCreators, well down the page. Lazy: see the import
          above for why. The fallback reserves roughly the section's own
          height so replacing it does not itself cost a layout shift. */}
      <Suspense fallback={<div className="cc-section-fallback" aria-hidden="true" />}>
        <CreatorCapital />
      </Suspense>
      <Trending />
      <HowItWorks />
      <AccessModels />
      <Features />
      <ForCreators />
      <Testimonials />
      <CallToAction />
      <Footer />
    </div>
  )
}
