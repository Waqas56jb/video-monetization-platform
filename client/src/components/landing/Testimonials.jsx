import { useNavigate } from 'react-router-dom'
import { BadgeCheck, Handshake, ShieldCheck, Wallet } from 'lucide-react'
import Reveal from '@/components/ui/Reveal'
import useApi, { tzs, compact } from '@/hooks/useApi'
import api from '@/lib/api'

/**
 * Why a creator should trust this with their work.
 *
 * This section used to be five testimonials — quotes attributed to named
 * Tanzanian artists, with figures beside them, on a platform that had never
 * paid anyone. They read as endorsements from real people and they were
 * invented, so they are gone.
 *
 * In their place: the platform's actual commitments, which are true from day
 * one. Once creators really are earning, the section switches to showing them
 * — real names, real amounts, no quotes put in anybody's mouth.
 */
export default function Testimonials() {
  const navigate = useNavigate()

  const stats = useApi(() => api.stats.platform(), [])
  const top = useApi(() => api.stats.topCreators(), [])

  const creators = top.data?.creators || []
  const split = stats.data?.creatorSplitPercent ?? 70

  const PROMISES = [
    {
      icon: ShieldCheck,
      title: 'Your work stays yours',
      text: 'You set the price and the free preview. Nobody can publish, reprice or remove your video without you — and once someone buys it, their copy never disappears either.',
    },
    {
      icon: Wallet,
      title: `You keep ${split}% of every sale`,
      text: 'Tracked to the shilling in your dashboard, paid out to M-Pesa or Airtel Money. Every transaction is listed with your share of it, so nothing has to be taken on trust.',
    },
    {
      icon: Handshake,
      title: 'It keeps earning after the paywall',
      text: 'When a Paid Premiere window closes, the video turns free with ads and carries on paying you. One upload, two ways to earn from it.',
    },
  ]

  return (
    <section className="section" id="stories">
      <div className="container">
        <Reveal className="section-head">
          <span className="badge">
            <BadgeCheck style={{ width: 14, height: 14 }} />
            {creators.length ? 'CREATORS EARNING NOW' : 'WHAT YOU GET'}
          </span>
          <h2>
            {creators.length ? (
              <>
                Creators Are <span className="grad-text">Getting Paid</span>
              </>
            ) : (
              <>
                Built To Pay <span className="grad-text">Creators First</span>
              </>
            )}
          </h2>
          <p>
            {creators.length
              ? 'Real Tanzanian creators, real mobile money in their pockets.'
              : 'No fine print and no waiting to find out how it works. This is the deal.'}
          </p>
        </Reveal>

        {creators.length ? (
          <div className="testi-grid">
            {creators.map((c, i) => (
              <Reveal className="testi testi-creator" key={c.id} delay={i}>
                <div className="testi-user" style={{ marginTop: 0 }}>
                  {c.avatarUrl ? (
                    <img src={c.avatarUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="testi-initials">{initials(c.name)}</span>
                  )}
                  <div>
                    <b>
                      {c.name}
                      {c.verified && <BadgeCheck className="verified-tick" />}
                    </b>
                    <small>
                      {[c.location, `${compact(c.videos)} video${c.videos === 1 ? '' : 's'}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </small>
                  </div>
                  <div className="amt">
                    <b>{tzs(c.earnedTzs)}</b>
                    <small>earned so far</small>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        ) : (
          <div className="promise-grid">
            {PROMISES.map((p, i) => (
              <Reveal className="promise" key={p.title} delay={i}>
                <span className="promise-ic">
                  <p.icon />
                </span>
                <b>{p.title}</b>
                <p>{p.text}</p>
              </Reveal>
            ))}
          </div>
        )}

        <Reveal className="center" style={{ marginTop: 40 }}>
          <button className="btn btn-gold" onClick={() => navigate('/signup')}>
            Start selling your work
          </button>
        </Reveal>
      </div>
    </section>
  )
}

const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join('') || '?'
