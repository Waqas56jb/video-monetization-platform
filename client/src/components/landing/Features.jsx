import { BadgeCheck, Check, Eye, Film, Gem, Lock, Play, Share2, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import Reveal from '@/components/ui/Reveal'
import useApi, { compact, duration } from '@/hooks/useApi'
import api, { mediaUrl } from '@/lib/api'
import { CONTENT_KINDS, PLATFORM_POWERS } from '@/data/copy'

/** Used only until the API answers, so the block is never empty on first paint. */
const SHARE_DEMO = {
  slug: 'behind-the-fame-a-coast-documentary',
  title: 'Behind The Fame — A Coast Documentary',
  creator: { name: 'Asha Mwinyi' },
}

/**
 * The share card, as the person receiving it sees it.
 *
 * It used to be the finished Open Graph JPEG with the title, the creator and
 * WATCH FREE PREVIEW printed underneath it as well — so every one of them
 * appeared twice, once burned into the picture and once in the markup below.
 * The client asked for this to look like the card in the share sheet, which
 * composes those over the poster instead, and it now shares that markup and
 * those styles so the two cannot drift apart.
 *
 * The poster is the raw film frame rather than the branded JPEG, because the
 * branding is drawn on top here. And the video is whatever is genuinely
 * trending, which is what lets the line underneath say this is a real share
 * card without it being a claim.
 */
function ShareCardDemo() {
  const trending = useApi(() => api.videos.list({ sort: 'trending', limit: 1 }), [])
  const v = trending.data?.videos?.[0] || SHARE_DEMO
  const slug = v.slug || SHARE_DEMO.slug
  const poster = mediaUrl(v.thumbnailUrl)
  const creator = v.creator?.name || v.creatorName
  const fresh =
    v.publishedAt && Date.now() - new Date(v.publishedAt).getTime() < 1000 * 60 * 60 * 24 * 21

  return (
    <div className="pw-viz pw-viz-discover">
      <div className="pw-share-head">
        <Share2 size={14} />
        <span>On WhatsApp and social</span>
      </div>
      <p className="pw-journey">Share → Watch free preview → Pay → Keep watching</p>

      <Link
        className="share-og-stage pw-og-stage"
        to={`/watch/${slug}`}
        aria-label={`${v.title} — watch the free preview`}
      >
        {poster ? (
          <img src={poster} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className="share-thumb-blank" aria-hidden="true">
            <Film size={26} />
          </span>
        )}
        <span className="share-og-veil" aria-hidden="true" />
        <span className="share-og-badge">MTONYO+</span>
        {v.durationSeconds > 0 && (
          <span className="share-og-time">{duration(v.durationSeconds)}</span>
        )}
        <span className="share-og-play" aria-hidden="true">
          <Play size={22} fill="currentColor" />
        </span>
        <span className="share-og-meta">
          {fresh && <span className="share-og-new">New release</span>}
          <b>{v.title}</b>
          {creator && (
            <small>
              {creator}
              {v.creator?.verified && <BadgeCheck size={13} />}
            </small>
          )}
          <em>Watch free preview</em>
        </span>
        <span className="share-og-stats">
          {v.views != null && (
            <span>
              <Eye size={12} />
              {compact(v.views)} views
            </span>
          )}
          {Number(v.priceTzs || 0) > 0 && (
            <span>
              <Lock size={12} />
              Pay to continue
            </span>
          )}
        </span>
      </Link>

      <small>
        This is a real share card. Tap it — that video, free preview, then pay.{' '}
        <Link className="pw-try" to={`/watch/${slug}?share=1`}>
          Open Share
        </Link>
      </small>
    </div>
  )
}

/** A small, honest picture of each capability. No images, no weight. */
const VISUALS = {
  discover: <ShareCardDemo />,

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
