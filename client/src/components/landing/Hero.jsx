import { useNavigate } from 'react-router-dom'
import { PlayCircle, Rocket } from 'lucide-react'
import Reveal from '@/components/ui/Reveal'
import CountUp from '@/components/ui/CountUp'
import Icon from '@/components/ui/Icon'
import PhoneMockup from './PhoneMockup'
import { HERO_FLOAT_CARDS, HERO_STATS, IMG } from '@/data/content'

export default function Hero() {
  const navigate = useNavigate()

  return (
    <section className="hero">
      <div className="hero-bg">
        <img src={IMG.concert} alt="Concert" />
      </div>

      <div className="container hero-grid">
        <div>
          <Reveal as="span" className="badge" immediate>
            <span className="dot" />
            TANZANIA&apos;S #1 CREATOR PLATFORM
          </Reveal>

          <Reveal as="h1" immediate>
            Upload. Sell.
            <br />
            <span className="grad-text">Get Paid</span> Before
            <br />
            You Go Free.
          </Reveal>

          <Reveal as="p" className="hero-sub" delay={1} immediate>
            The premium home for Tanzanian creators. Sell your videos with <b>PPV Forever</b> or{' '}
            <b>Paid Premiere</b>, get paid instantly via <b>M-Pesa &amp; Airtel Money</b> — then
            release free with ads and keep earning.
          </Reveal>

          <Reveal className="hero-actions" delay={2} immediate>
            <button className="btn btn-gold" onClick={() => navigate('/signup')}>
              <Rocket />
              <span className="btn-label-full">Start Earning Today</span>
              <span className="btn-label-short">Start Earning</span>
            </button>
            <button className="btn btn-ghost" onClick={() => navigate('/watch/behind-the-fame')}>
              <PlayCircle />
              <span className="btn-label-full">Watch a Premiere</span>
              <span className="btn-label-short">Watch Premiere</span>
            </button>
          </Reveal>

          <Reveal className="hero-stats" delay={3} immediate>
            {HERO_STATS.map((s) => (
              <div className="hstat" key={s.label}>
                <b>
                  {s.prefix}
                  <CountUp to={s.count} />
                  {s.suffix}
                </b>
                <span>{s.label}</span>
              </div>
            ))}
          </Reveal>
        </div>

        <Reveal className="hero-visual" delay={2} immediate>
          {HERO_FLOAT_CARDS.map((c) => (
            <div className={`float-card ${c.cls}`} key={c.cls}>
              <span className="ic">
                <Icon name={c.icon} />
              </span>
              <div>
                <b>{c.title}</b>
                <small>{c.sub}</small>
              </div>
            </div>
          ))}
          <PhoneMockup onUnlock={() => navigate('/watch/behind-the-fame')} />
        </Reveal>
      </div>

      <div className="scroll-hint" aria-hidden="true">
        <span className="wheel" />
        Scroll
      </div>
    </section>
  )
}
