import {
  BadgeCheck,
  Check,
  Clapperboard,
  Eye,
  Film,
  Gem,
  Link2,
  Lock,
  Play,
  Share2,
  TrendingUp,
} from 'lucide-react'
import {
  IconFacebook,
  IconInstagram,
  IconTikTok,
  IconWhatsApp,
} from '@/components/ui/SocialIcons'
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
 * The share sheet exactly as it appears in the app.
 *
 * The homepage used to show only the card a recipient receives, which answers
 * "what do they get" and leaves "what do I press" unanswered -- and pressing
 * it is the part a creator has to believe in before they upload anything. The
 * real class names are reused deliberately: this is the interface, not an
 * artist's impression of it, and it cannot drift away from the real one
 * without the drift being visible here.
 *
 * Inert on purpose. Everything is a span, and the block is hidden from screen
 * readers, because offering controls that do nothing is worse than showing no
 * controls at all.
 */
function ShareSheetPreview() {
  return (
    <div className="pw-sheet" aria-hidden="true">
      <div className="pw-sheet-bar">
        <b>Share this video</b>
        <span className="pw-sheet-x">&times;</span>
      </div>

      <span className="share-wa pw-sheet-wa">
        <IconWhatsApp size={24} />
        <span className="share-wa-copy">
          <b>Share on WhatsApp</b>
          <small>Share privately or in groups</small>
        </span>
      </span>

      <div className="share-targets">
        <span className="share-target is-ig">
          <IconInstagram />
          <b>Instagram</b>
          <small>Feed, Reels, Story</small>
        </span>
        <span className="share-target is-tt">
          <IconTikTok />
          <b>TikTok</b>
          <small>Share video</small>
        </span>
        <span className="share-target is-fb">
          <IconFacebook />
          <b>Facebook</b>
          <small>Share to Feed</small>
        </span>
        <span className="share-target is-copy">
          <Link2 size={22} />
          <b>Copy link</b>
          <small>Get shareable link</small>
        </span>
      </div>

      <span className="pw-sheet-clip">
        <Clapperboard size={18} />
        <span>
          <b>Save 60s promo clip</b>
          <small>For WhatsApp Status, Reels, TikTok &amp; Stories</small>
        </span>
      </span>
    </div>
  )
}

/**
 * The share card as the person receiving it sees it — poster, title, creator,
 * WATCH FREE PREVIEW. A picture of the card, not a link.
 */
function ShareCardDemo() {
  const trending = useApi(() => api.videos.list({ sort: 'trending', limit: 1 }), [])
  const v = trending.data?.videos?.[0] || SHARE_DEMO
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

      <ShareSheetPreview />

      <p className="pw-sheet-arrow">
        <span>What they receive</span>
      </p>

      <div className="share-og-stage pw-og-stage">
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
      </div>

      <small>Share → Watch free preview → Pay → Continue watching</small>
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
