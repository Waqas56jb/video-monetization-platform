import { useEffect, useState } from 'react'
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

  useEffect(() => {
    // Always clear — never gate on Unsplash / fonts (slow or blocked on mobile).
    const t = setTimeout(() => setSplash(false), 380)
    return () => clearTimeout(t)
  }, [])

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
