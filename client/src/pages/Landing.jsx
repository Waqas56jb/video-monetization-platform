import { useEffect } from 'react'
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
