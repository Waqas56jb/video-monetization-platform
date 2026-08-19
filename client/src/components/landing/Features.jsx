import { Check, Gem, Share2, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import Reveal from '@/components/ui/Reveal'
import { CONTENT_KINDS, PLATFORM_POWERS } from '@/data/copy'

const SHARE_DEMO = {
  slug: 'behind-the-fame-a-coast-documentary',
  title: 'Behind The Fame — A Coast Documentary',
  creator: 'Asha Mwinyi',
}

/** A small, honest picture of each capability. No images, no weight. */
const VISUALS = {
  discover: (
    <div className="pw-viz pw-viz-discover">
      <div className="pw-share-head">
        <Share2 size={14} />
        <span>On WhatsApp and social</span>
      </div>
      <p className="pw-journey">Share → Watch free preview → Pay → Keep watching</p>
      <Link
        className="pw-og"
        to={`/watch/${SHARE_DEMO.slug}`}
        aria-label={`${SHARE_DEMO.title} — watch the free preview`}
      >
        <span className="pw-og-poster">
          <img
            src={`/og/card/${SHARE_DEMO.slug}.jpg`}
            alt=""
            width={1200}
            height={630}
          />
        </span>
        <span className="pw-og-body">
          <span className="pw-og-brand">MTONYO+</span>
          <b>{SHARE_DEMO.title}</b>
          <small>{SHARE_DEMO.creator}</small>
          <em>WATCH FREE PREVIEW</em>
        </span>
      </Link>
      <small>
        This is a real share card. Tap it — that video, free preview, then pay.{' '}
        <Link className="pw-try" to={`/watch/${SHARE_DEMO.slug}?share=1`}>
          Open Share
        </Link>
      </small>
    </div>
  ),

  monetize: (
    <div className="pw-viz pw-viz-monetize">
      <div className="pw-bar" aria-hidden="true">
        <span className="pw-seg is-free">Free preview</span>
        <span className="pw-seg is-paid">Paid</span>
      </div>
      <div className="pw-pay">
        <b>Unlock &amp; continue</b>
        <span className="pw-methods">M-Pesa · Airtel Money</span>
      </div>
      <small>You choose where the preview stops</small>
    </div>
  ),

  grow: (
    <div className="pw-viz pw-viz-grow">
      <div className="pw-chart" aria-hidden="true">
        {[34, 52, 41, 68, 59, 83, 72].map((h, i) => (
          <span key={i} style={{ height: `${h}%` }} />
        ))}
      </div>
      <div className="pw-grow-foot">
        <TrendingUp size={14} />
        <span>Your share of every sale, as it lands</span>
      </div>
      {/* Labelled, because an unlabelled chart on a marketing page reads as a
          claim about real performance. It is a shape, and it says so. */}
      <small>Illustration — your dashboard shows your own figures</small>
    </div>
  ),
}

export default function Features() {
  const [lead, ...rest] = PLATFORM_POWERS

  return (
    <section className="section section-power" id="features">
      <div className="container">
        <div className="section-head">
          <span className="badge">
            <Gem style={{ width: 14, height: 14 }} />
            PLATFORM POWER
          </span>
          <h2>
            Share Any Story. <span className="grad-text">Earn Your Way.</span>
          </h2>
          <p>
            Whatever you make, MTONYO+ can sell it — built on world-class streaming infrastructure
            and secure payments.
          </p>
        </div>

        {/* One wide story, then two beneath it. Asymmetric on purpose: three
            equal columns would be the grid this section is escaping. */}
        <Reveal className={`power is-lead ${lead.tone || ''}`.trim()} variant="left">
          <div className="power-copy">
            <span className="power-kicker">{lead.kicker}</span>
            <h3>{lead.title}</h3>
            <p>{lead.text}</p>
            <ul className="power-list">
              {lead.points.map((p) => (
                <li key={p}>
                  <Check size={14} />
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <div className="power-viz">{VISUALS[lead.key]}</div>
        </Reveal>

        <div className="power-pair">
          {rest.map((power, i) => (
            <Reveal
              key={power.key}
              className={`power ${power.tone || ''}`.trim()}
              variant="up"
              delay={i + 1}
            >
              <div className="power-viz">{VISUALS[power.key]}</div>
              <div className="power-copy">
                <span className="power-kicker">{power.kicker}</span>
                <h3>{power.title}</h3>
                <p>{power.text}</p>
                <ul className="power-list">
                  {power.points.map((p) => (
                    <li key={p}>
                      <Check size={14} />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>

        {/**
         * What people actually publish here — kept, but demoted.
         *
         * The page read as a film-and-music platform, which quietly tells a
         * podcaster or a tutor it is not for them. As a quiet strip under the
         * three stories it still says otherwise without competing with them.
         */}
        <ul className="kind-chips kind-chips-strip">
          {CONTENT_KINDS.map((kind) => (
            <li key={kind}>{kind}</li>
          ))}
        </ul>
      </div>
    </section>
  )
}
