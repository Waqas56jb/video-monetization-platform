import { useNavigate } from 'react-router-dom'
import { PlayCircle, Rocket } from 'lucide-react'
import CountUp from '@/components/ui/CountUp'
import Icon from '@/components/ui/Icon'
import PhoneMockup from './PhoneMockup'
import useApi from '@/hooks/useApi'
import api from '@/lib/api'
import { IMG, LANDING_SHOWCASE } from '@/data/copy'

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
 * The phone mockup uses the landing showcase card so the hero design always
 * looks finished — real catalogue browsing starts at Explore.
 */
export default function Hero() {
  const navigate = useNavigate()

  const stats = useApi(() => api.stats.platform(), [])

  const s = stats.data
  const showcase = LANDING_SHOWCASE[0]
  const featured = {
    title: showcase.title,
    thumbnailUrl: showcase.thumb,
    category: 'Documentary',
    creator: { name: showcase.author },
    accessType: 'paid_premiere',
    priceTzs: 500,
    freePreviewSeconds: 300,
    durationSeconds: 1214,
  }

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
        { count: 2, prefix: '', suffix: '', label: 'Ways to get paid · M-Pesa & Airtel' },
        { count: 24, prefix: '', suffix: 'h', label: 'Withdrawal turnaround' },
      ]

  const floatCards = s?.hasActivity
    ? [
        { cls: 'fc1', icon: 'badge-check', title: 'Instant unlock', sub: 'M-Pesa & Airtel Money' },
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
        { cls: 'fc1', icon: 'badge-check', title: 'Instant unlock', sub: 'M-Pesa & Airtel Money' },
        { cls: 'fc2', icon: 'wallet', title: `You keep ${s?.creatorSplitPercent ?? 70}%`, sub: 'Of every single sale' },
        { cls: 'fc3', icon: 'trending-up', title: 'Then free with ads', sub: 'And it keeps earning' },
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
            Upload. Sell.
            <br />
            <span className="grad-text">Get Paid</span> Before
            <br />
            You Go Free.
          </h1>

          <p className="hero-sub">
            The premium home for Tanzanian creators. Sell your videos with <b>PPV Forever</b> or{' '}
            <b>Paid Premiere</b>, get paid instantly via <b>M-Pesa &amp; Airtel Money</b> — then
            release free with ads and keep earning.
          </p>

          <div className="hero-actions">
            <button className="btn btn-gold" onClick={() => navigate('/signup')}>
              <Rocket />
              <span className="btn-label-full">Start Earning Today</span>
              <span className="btn-label-short">Start Earning</span>
            </button>
            <button className="btn btn-ghost" onClick={() => navigate('/explore')}>
              <PlayCircle />
              <span className="btn-label-full">Watch a Premiere</span>
              <span className="btn-label-short">Watch</span>
            </button>
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
          <PhoneMockup video={featured} onUnlock={() => navigate('/explore')} />
        </div>
      </div>

      <div className="scroll-hint" aria-hidden="true">
        <span className="wheel" />
        Scroll
      </div>
    </section>
  )
}
