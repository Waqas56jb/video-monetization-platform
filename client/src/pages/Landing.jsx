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
import useLandingReady from '@/hooks/useLandingReady'

/**
 * Marketing homepage.
 *
 * The whole page is held behind a boot screen until critical assets are ready,
 * then mounted in one shot — no hero-only flash with blank sections below,
 * and no scroll-lock while waiting.
 */
export default function Landing() {
  const ready = useLandingReady()

  if (!ready) {
    return (
      <div className="landing-boot" aria-busy="true" aria-label="Loading MTONYO+">
        <div className="loader-logo">
          MTONYO<span className="logo-plus">+</span>
        </div>
        <div className="loader-bar">
          <span />
        </div>
        <p className="landing-boot-note">Loading the page…</p>
      </div>
    )
  }

  return (
    <div className="page landing-page is-ready">
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
  )
}
