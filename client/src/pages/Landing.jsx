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

export default function Landing() {
  return (
    <div className="page">
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
