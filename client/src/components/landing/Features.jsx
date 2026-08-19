import { Check, Gem, Play, Share2, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import Reveal from '@/components/ui/Reveal'
import { CONTENT_KINDS, PLATFORM_POWERS } from '@/data/copy'

/**
 * What the platform actually does for a creator.
 *
 * This was a 3×2 grid of icon cards — six equal tiles, directly beneath two
 * other grids. It is the single biggest contributor to "a PDF made of boxes",
 * and six equal tiles also flatten the difference between "you can set a
 * preview length" and "nobody can steal your film".
 *
 * Three stories now, in an asymmetric layout: one wide band, then two columns
 * beneath it. Deliberately NOT the alternating pattern the release models use
 * — repeating that shape twice in a row would recreate the same problem one
 * level up. Variety between sections is the point.
 *
 * The visuals are composed from the design system rather than photographed.
 * Three more hero-sized images would cost every visitor on mobile data real
 * seconds, and a diagram of the thing beats a stock photo near the thing.
 */

/** A small, honest picture of each capability. No images, no weight. */
const VISUALS = {
  discover: (
    <div className="pw-viz pw-viz-discover">
      <div className="pw-share-head">
        <Share2 size={14} />
        <span>On WhatsApp and social</span>
      </div>
      <p className="pw-journey">Share → Watch free preview → Pay → Keep watching</p>
      <div className="pw-og" aria-hidden="true">
        <span className="pw-og-poster">
          <Play size={18} />
        </span>
        <span className="pw-og-body">
          <span className="pw-og-brand">MTONYO+</span>
          <b>Video title</b>
          <small>Creator name</small>
          <em>WATCH FREE PREVIEW</em>
        </span>
      </div>
      <small>
        Opens that exact video — free preview, then pay to continue.{' '}
        <Link className="pw-try" to="/watch/behind-the-fame-a-coast-documentary">
          Try it on a video
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
