import { Check, Gem, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import Reveal from '@/components/ui/Reveal'
import useApi from '@/hooks/useApi'
import api from '@/lib/api'
import { CONTENT_KINDS, PLATFORM_POWERS } from '@/data/copy'

/** Used only until the API answers, so the block is never empty on first paint. */
const SHARE_DEMO = {
  slug: 'behind-the-fame-a-coast-documentary',
  title: 'Behind The Fame — A Coast Documentary',
  creator: { name: 'Asha Mwinyi' },
}

function IconWhatsApp({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.4-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.14-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.48.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35zM12.05 21.79h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26C2.16 5.34 6.59.9 12.05.9a9.82 9.82 0 0 1 6.99 2.9 9.83 9.83 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88zm8.41-18.3A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L0 24l6.3-1.65a11.88 11.88 0 0 0 5.74 1.46h.01c6.55 0 11.89-5.34 11.89-11.89 0-3.18-1.24-6.16-3.48-8.41z" />
    </svg>
  )
}
function IconFacebook({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M22.68 12.07C22.68 6.13 17.87 1.32 11.93 1.32S1.18 6.13 1.18 12.07c0 5.37 3.93 9.82 9.07 10.61v-7.51H7.66v-3.1h2.59V9.7c0-2.56 1.52-3.97 3.85-3.97 1.12 0 2.28.2 2.28.2v2.51h-1.28c-1.27 0-1.66.79-1.66 1.6v1.92h2.83l-.45 3.1h-2.38v7.51c5.14-.79 9.07-5.24 9.07-10.61z" />
    </svg>
  )
}
function IconLink({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10.7 5.24" />
      <path d="M14 11a5 5 0 0 0-7.07 0L5.52 12.4a5 5 0 0 0 7.07 7.07l1.72-1.72" />
    </svg>
  )
}

/**
 * The homepage Share block must show the real Share This Video interface —
 * WhatsApp, Instagram, TikTok, Facebook, Copy — not only a poster card.
 * Buttons open that video's share sheet so a tap is a real action.
 */
function ShareThisVideoDemo() {
  const trending = useApi(() => api.videos.list({ sort: 'trending', limit: 1 }), [])
  const v = trending.data?.videos?.[0] || SHARE_DEMO
  const slug = v.slug || SHARE_DEMO.slug
  const shareTo = `/watch/${slug}?share=1`
  const ogCard = `/og/card/${encodeURIComponent(slug)}.jpg`

  return (
    <div className="pw-viz pw-share-sheet">
      <div className="share-card pw-share-card">
        <h3>Share this video</h3>
        <p className="share-sub">
          Poster card in the chat. Preview plays on MTONYO+ after they tap.
        </p>
        <div className="share-og">
          <Link className="share-og-stage" to={shareTo} aria-label={`${v.title} — open Share`}>
            <img src={ogCard} alt="" loading="lazy" decoding="async" />
          </Link>
        </div>
        <Link className="share-wa" to={shareTo}>
          <IconWhatsApp size={26} />
          <span className="share-wa-copy">
            <b>Share on WhatsApp</b>
            <small>Opens WhatsApp with this video</small>
          </span>
        </Link>
        <div className="share-targets share-targets-direct">
          <Link className="share-target is-fb" to={shareTo}>
            <IconFacebook />
            <b>Facebook</b>
            <small>Opens Facebook with this link</small>
          </Link>
          <Link className="share-target is-copy" to={shareTo}>
            <IconLink />
            <b>Copy link</b>
            <small>Paste anywhere</small>
          </Link>
        </div>
        <small>
          Recipients get a poster card. The preview plays on MTONYO+ after they tap — not inside WhatsApp.{' '}
          <Link className="pw-try" to={shareTo}>
            Open Share
          </Link>
        </small>
      </div>
    </div>
  )
}

/** A small, honest picture of each capability. No images, no weight. */
const VISUALS = {
  discover: <ShareThisVideoDemo />,

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
