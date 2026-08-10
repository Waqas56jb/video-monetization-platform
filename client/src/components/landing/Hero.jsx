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

  // Real measurements once there are any; otherwise the promises, which need
  // no qualification and cannot go stale.
  const heroStats = s?.hasActivity
    ? [
        { count: s.paidToCreatorsTzs, prefix: 'TZS ', suffix: '', label: 'Paid to creators' },
        { count: s.creators, prefix: '', suffix: '', label: 'Creators earning' },
        { count: s.publishedVideos, prefix: '', suffix: '', label: 'Videos on sale' },
      ]
    : [
        { count: s?.creatorSplitPercent ?? 70, prefix: '', suffix: '%', label: 'Of every sale is yours' },
        { count: 3, prefix: '', suffix: '', label: 'Ways to get paid' },
        { count: 24, prefix: '', suffix: 'h', label: 'Withdrawal turnaround' },
      ]

  const floatCards = s?.hasActivity
    ? [
        { cls: 'fc1', icon: 'badge-check', title: 'Instant unlock', sub: 'Mobile Money • Cards • Digital' },
        {
          cls: 'fc2',
          icon: 'wallet',
          title: `TZS ${Number(s.paidToCreatorsTzs).toLocaleString()}`,
          sub: 'Paid to creators so far',
        },
        {
          cls: 'fc3',
          icon: 'trending-up',
          title: `${Number(s.paidUnlocks).toLocaleString()} paid unlocks`,
          sub: 'Across the platform',
        },
      ]
    : [
        {
          cls: 'fc1',
          icon: 'badge-check',
          title: 'Instant unlock',
          sub: 'Mobile Money • Cards • Digital Payments',
        },
        { cls: 'fc2', icon: 'wallet', title: `You keep ${s?.creatorSplitPercent ?? 70}%`, sub: 'Of every single sale' },
        { cls: 'fc3', icon: 'trending-up', title: 'Then Free + Ads', sub: 'And it keeps earning' },
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
            decide what stays paid, what becomes free, and when.
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
                <b>
                  {st.prefix}
                  <CountUp to={st.count} />
                  {st.suffix}
                </b>
                <span>{st.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="hero-visual">
          {floatCards.map((c) => (
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
