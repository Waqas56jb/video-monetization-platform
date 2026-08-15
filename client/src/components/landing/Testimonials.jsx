import { useNavigate } from 'react-router-dom'
import { BadgeCheck, Handshake, ShieldCheck, Wallet } from 'lucide-react'
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
      text: 'When a Paid Premiere window closes, the video turns Free + Ads and carries on paying you. One upload, two ways to earn from it.',
    },
  ]

  return (
    <section className="section" id="stories">
      <div className="container">
        <div className="section-head">
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
        </div>

        {creators.length ? (
          /**
           * A spotlight, not a row of equal cards.
           *
           * These are real people from the API, and the leading earner
           * deserves to be seen rather than tiled. No quote is attached to any
           * of them — nobody has been asked for one, and inventing one would be
           * putting words in a real creator's mouth.
           */
          <div className="spotlight">
            {(() => {
              const [lead, ...rest] = creators
              return (
                <>
                  <article className="spot-lead">
                    <div className="spot-face">
                      {lead.avatarUrl ? (
                        <img src={lead.avatarUrl} alt="" loading="lazy" decoding="async" />
                      ) : (
                        <span className="spot-initials">{initials(lead.name)}</span>
                      )}
                    </div>
                    <div className="spot-body">
                      <span className="spot-kicker">Earning on MTONYO+</span>
                      <h3>
                        {lead.name}
                        {lead.verified && <BadgeCheck className="verified-tick" />}
                      </h3>
                      <p className="spot-meta">
                        {[lead.location, `${compact(lead.videos)} video${lead.videos === 1 ? '' : 's'}`]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      <div className="spot-amount">
                        <b>{tzs(lead.earnedTzs)}</b>
                        <small>paid out to them so far</small>
                      </div>
                    </div>
                  </article>

                  {rest.length > 0 && (
                    <ul className="spot-rest">
                      {rest.map((c) => (
                        <li key={c.id}>
                          {c.avatarUrl ? (
                            <img src={c.avatarUrl} alt="" loading="lazy" decoding="async" />
                          ) : (
                            <span className="spot-initials sm">{initials(c.name)}</span>
                          )}
                          <div>
                            <b>
                              {c.name}
                              {c.verified && <BadgeCheck className="verified-tick" />}
                            </b>
                            <small>
                              {compact(c.videos)} video{c.videos === 1 ? '' : 's'}
                            </small>
                          </div>
                          <span className="spot-amt">{tzs(c.earnedTzs)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )
            })()}
          </div>
        ) : (
          /**
           * Until somebody has actually been paid, this is the honest version
           * of social proof: what the platform commits to, stated plainly.
           * Editorial rows rather than three equal cards — the same reason
           * every other section stopped being a grid.
           */
          <ol className="promises">
            {PROMISES.map((p, i) => (
              <li className="promise-row" key={p.title}>
                <span className="promise-n" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                <span className="promise-ic">
                  <p.icon size={19} />
                </span>
                <div>
                  <b>{p.title}</b>
                  <p>{p.text}</p>
                </div>
              </li>
            ))}
          </ol>
        )}

        <div className="center" style={{ marginTop: 40 }}>
          <button className="btn btn-gold" onClick={() => navigate('/signup')}>
            Start selling your work
          </button>
        </div>
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
