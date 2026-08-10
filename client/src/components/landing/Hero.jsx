import { useNavigate } from 'react-router-dom'
import { CreditCard, PlayCircle, Rocket, Smartphone, Wallet } from 'lucide-react'
import CountUp from '@/components/ui/CountUp'
import Icon from '@/components/ui/Icon'
import PhoneMockup from './PhoneMockup'
import useApi from '@/hooks/useApi'
import api from '@/lib/api'
import { videoLink } from '@/lib/videoView'
import { IMG } from '@/data/copy'

/**
 * The first thing anyone sees.
 *
 * The figures underneath used to be invented — "TZS 142M paid to creators" on
 * a platform that had paid out nothing. They are now counted, and when there
 * is nothing to count the hero leads with what the platform *offers* instead:
 * the revenue split, the payment methods, the payout time. Those are facts
 * about how it works, not claims about how well it is doing, so they are true
 * on day one and stay true.
 *
 * The phone mockup shows the video that is actually trending, and tapping it
 * opens that video — it used to show an invented one, so the most prominent
 * thing on the page led nowhere.
 */
/**
 * The dashed threads between the phone and the cards around it.
 *
 * Purely decorative — they are what makes the group read as one diagram rather
 * than five boxes that happen to be near a phone. Drawn as one SVG on a fixed
 * viewBox and stretched to the stage, so the curves keep their shape at any
 * width instead of needing a rule per breakpoint. Hidden wherever the cards are.
 */
function HeroLinks() {
  return (
    <svg
      className="hero-links"
      viewBox="0 0 600 640"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <g
        fill="none"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="1.4"
        strokeDasharray="5 7"
        strokeLinecap="round"
      >
        {/* right: the phone's edge out to Pay Once, Paid Premiere, Free + Ads */}
        <path d="M392 168 C 428 150, 446 128, 470 118" />
        <path d="M396 330 C 432 328, 448 322, 470 320" />
        <path d="M392 500 C 428 516, 446 534, 470 542" />
        {/* left: down and across to Instant Unlock, then Creators Earn */}
        <path d="M208 210 C 186 196, 172 190, 150 188" />
        <path d="M208 452 C 186 468, 172 478, 150 482" />
      </g>
    </svg>
  )
}

export default function Hero() {
  const navigate = useNavigate()

  const stats = useApi(() => api.stats.platform(), [])

  /**
   * The phone shows a real video, and tapping it opens that video.
   *
   * It used to show an invented one — a made-up title at a made-up price — which
   * meant the most prominent thing on the page led nowhere. `PhoneMockup` already
   * falls back to a plain illustration of the mechanic when the platform has
   * nothing published, so an empty catalogue is handled without inventing
   * anything.
   */
  const trending = useApi(() => api.videos.list({ sort: 'trending', limit: 1 }), [])
  const featured = trending.data?.videos?.[0] || null

  const s = stats.data

  /**
   * The three figures under the buttons, labelled as the client's design labels
   * them — and still counted, never claimed.
   *
   * Before there is anything to count, the same three slots carry facts about how
   * the platform works instead. Those are true on day one and cannot go stale,
   * where "TZS 0 earned by creators" on a launch day says nothing anybody wants
   * to read.
   */
  const heroStats = s?.hasActivity
    ? [
        { icon: 'wallet', count: s.paidToCreatorsTzs, prefix: 'TZS ', suffix: '', label: 'Earned by creators' },
        { icon: 'users', count: s.creators, prefix: '', suffix: '', label: 'Creators earning' },
        { icon: 'clapperboard', count: s.publishedVideos, prefix: '', suffix: '', label: 'Exclusive releases' },
      ]
    : [
        { icon: 'wallet', count: s?.creatorSplitPercent ?? 70, prefix: '', suffix: '%', label: 'Of every sale is yours' },
        { icon: 'users', count: 3, prefix: '', suffix: '', label: 'Ways to get paid' },
        { icon: 'clapperboard', count: 24, prefix: '', suffix: 'h', label: 'Withdrawal turnaround' },
      ]

  /**
   * The cards floating around the phone.
   *
   * Two on the left describe what the viewer and the creator each get out of a
   * payment; three on the right are the release models, in the same order the
   * rest of the page introduces them. The positions come from the class — see
   * `.fc1`–`.fc5` — and the dashed lines behind them are drawn by `HeroLinks`.
   */
  const leftCards = [
    {
      cls: 'fc1',
      tone: 'is-green',
      icon: 'shield-check',
      title: 'Instant Unlock',
      body: 'Mobile Money • Cards • Digital Payments',
    },
    {
      cls: 'fc2',
      tone: 'is-purple',
      icon: 'trending-up',
      title: 'Creators Earn',
      body: 'Track sales, views and earnings.',
    },
  ]

  const rightCards = [
    {
      cls: 'fc3',
      tone: 'is-gold',
      icon: 'lock',
      title: 'Pay Once',
      body: 'One payment. Full access. The video stays in your library.',
    },
    {
      cls: 'fc4',
      tone: 'is-purple',
      icon: 'calendar-clock',
      title: 'Paid Premiere',
      body: 'Start paid. You choose your paid period. It becomes Free + Ads automatically.',
    },
    {
      cls: 'fc5',
      tone: 'is-green',
      icon: 'monitor-play',
      title: 'Free + Ads',
      body: 'Free to watch. Creators earn from advertising.',
    },
  ]

  return (
    <section className="hero">
      <div className="hero-bg">
        <img src={IMG.concert} alt="" loading="eager" fetchPriority="high" decoding="async" />
      </div>

      <div className="container hero-grid">
        <div>
          <span className="badge">
            <span className="dot" />
            TANZANIA&apos;S CREATOR PLATFORM
          </span>

          <h1>
            Your Content.
            <br />
            Your Audience.
            <br />
            <span className="grad-text">Your Earnings.</span>
          </h1>

          <p className="hero-sub">
            Upload exclusive content, set your price, and earn directly from your audience. You
            choose how people watch, what stays paid, and when your content becomes free.
          </p>

          <div className="hero-actions">
            <button className="btn btn-gold" onClick={() => navigate('/signup')}>
              <Rocket />
              <span className="btn-label-full">Start Earning Today</span>
              <span className="btn-label-short">Start Earning</span>
            </button>
            <button className="btn btn-ghost" onClick={() => navigate('/explore')}>
              <PlayCircle />
              <span className="btn-label-full">Explore MTONYO+</span>
              <span className="btn-label-short">Explore</span>
            </button>
          </div>

          {/**
           * Payments, described by what the viewer can do rather than by which
           * companies we happen to have connected.
           *
           * The old line named M-Pesa and Airtel Money specifically, which reads
           * as a limit — and dates the page the moment a third method is added.
           */}
          <div className="hero-pay">
            <b>Fast, Secure &amp; Flexible Payments</b>
            <div className="hero-pay-methods">
              <span>
                <Smartphone size={15} />
                Mobile Money
              </span>
              <i aria-hidden="true">•</i>
              <span>
                <CreditCard size={15} />
                Cards
              </span>
              <i aria-hidden="true">•</i>
              <span>
                <Wallet size={15} />
                Digital Payments
              </span>
            </div>
          </div>

          <div className="hero-stats">
            {heroStats.map((st) => (
              <div className="hstat" key={st.label}>
                <span className="hstat-ic">
                  <Icon name={st.icon} />
                </span>
                <div className="hstat-text">
                  <b>
                    {st.prefix}
                    <CountUp to={st.count} />
                    {st.suffix}
                  </b>
                  <span>{st.label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="hero-visual">
          <HeroLinks />

          {[...leftCards, ...rightCards].map((c) => (
            <div className={`float-card ${c.cls} ${c.tone}`} key={c.cls}>
              <div className="fc-head">
                <span className="ic">
                  <Icon name={c.icon} />
                </span>
                <b>{c.title}</b>
              </div>
              <small>{c.body}</small>
            </div>
          ))}

          <PhoneMockup
            video={featured}
            onUnlock={() => navigate(featured ? videoLink(featured) : '/explore')}
          />
        </div>
      </div>

      <div className="scroll-hint" aria-hidden="true">
        <span className="wheel" />
        Scroll
      </div>
    </section>
  )
}
