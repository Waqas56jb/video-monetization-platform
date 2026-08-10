import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { scrollWhenReady } from '@/hooks/useSectionLink'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import Hero from '@/components/landing/Hero'
import Marquee from '@/components/landing/Marquee'
import Trending from '@/components/landing/Trending'
import HowItWorks from '@/components/landing/HowItWorks'
import Features from '@/components/landing/Features'
import ForCreators from '@/components/landing/ForCreators'
import Testimonials from '@/components/landing/Testimonials'
import CallToAction from '@/components/landing/CallToAction'

/**
 * Marketing homepage — mounts immediately so mobile never spins on
 * remote fonts/images. A short splash sits on top and always clears.
 */
export default function Landing() {
  const [splash, setSplash] = useState(true)
  const { hash } = useLocation()

  useEffect(() => {
    // Always clear — never gate on Unsplash / fonts (slow or blocked on mobile).
    const t = setTimeout(() => setSplash(false), 380)
    return () => clearTimeout(t)
  }, [])

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
    <>
      {splash && (
        <div className="landing-boot" aria-busy="true" aria-label="Loading MTONYO+">
          <div className="loader-logo">
            MTONYO<span className="logo-plus">+</span>
          </div>
          <div className="loader-bar">
            <span />
          </div>
        </div>
      )}

      <div className={`page landing-page ${splash ? '' : 'is-ready'}`.trim()}>
        <Header />
        <Hero />
        <Marquee />
        <Trending />
        <HowItWorks />
        <Features />
        <ForCreators />
        <Testimonials />
        <CallToAction />
        <Footer />
      </div>
    </>
  )
}
