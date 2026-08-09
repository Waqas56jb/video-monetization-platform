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
 * Marketing homepage. Content below the hero must never sit at opacity:0
 * waiting for scroll — that made the page feel blank and “stuck”.
 * Reveals stay for light motion only after the page is already readable.
 */
export default function Landing() {
  return (
    <div className="page landing-page">
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
