import { ArrowRight, BadgeCheck, Check, CheckCircle2, Film, Gem, Link2, Lock, Play, Share2, TrendingUp } from 'lucide-react'
import {
  IconFacebook,
  IconInstagram,
  IconTikTok,
  IconWhatsApp,
} from '@/components/ui/SocialIcons'
import Reveal from '@/components/ui/Reveal'
import useApi, { duration } from '@/hooks/useApi'
import api, { mediaUrl } from '@/lib/api'
import { CONTENT_KINDS, IMG, PLATFORM_POWERS } from '@/data/copy'
import { landingFetcher, LANDING_KEYS, readLanding } from '@/lib/landingCache'

/** Used only until the API answers, so the block is never empty on first paint. */
const SHARE_DEMO = {
  slug: 'behind-the-fame-a-coast-documentary',
  title: 'Behind The Fame — A Coast Documentary',
  creator: { name: 'Asha Mwinyi' },
}

/**
 * The share journey, told on three phones (redesign 2026-11-17).
 *
 * The client: "I preferred the earlier phone-style presentation where the
 * video/share journey was easier to understand. The current split layout
 * feels cut up" — a share sheet and a card squeezed side by side in one panel,
 * with the video cut at the right edge. The journey asked for: VIDEO → SHARE →
 * attractive preview received → WATCH FREE PREVIEW → PAY → CONTINUE WATCHING,
 * with WhatsApp as the main action beside Instagram, TikTok, Facebook and Copy
 * Link.
 *
 * So: one phone per moment, left to right, each a picture of the real screen
 * (the share buttons reuse the app's own `share-*` classes). The video is the
 * one genuinely trending; nothing here is a claim. The phones are inert and
 * hidden from screen readers — the six-step strip underneath tells the same
 * story as text.
 */
function Phone({ step, label, children }) {
  return (
    <figure className="sj-stage">
      <figcaption className="sj-label">
        <span>{step}</span>
        {label}
      </figcaption>
      <div className="sj-phone" aria-hidden="true">
        <span className="sj-notch" />
        <div className="sj-screen">{children}</div>
      </div>
    </figure>
  )
}

function Poster({ poster }) {
  return poster ? (
    <img src={poster} alt="" loading="lazy" decoding="async" />
  ) : (
    <span className="share-thumb-blank">
      <Film size={26} />
    </span>
  )
}

function ShareJourney() {
  const trending = useApi(
    /* The list Trending already fetches; the same cache key, so no extra call. */
    landingFetcher(LANDING_KEYS.trending8, () => api.videos.list({ sort: 'trending', limit: 8 })),
    [],
    { initialData: readLanding(LANDING_KEYS.trending8) }
  )
  const v = trending.data?.videos?.[0] || SHARE_DEMO
  /* Never an empty frame: while the list is loading, if the API cannot be
     reached, or if the video has no thumbnail, the phones show a bundled
     poster instead of a blank box (client, 2026-11-20). */
  const poster = mediaUrl(v.thumbnailUrl) || IMG.konser
  const creator = v.creator?.name || v.creatorName
  const price = Number(v.priceTzs || 0)

  return (
    <div className="sj">
      {/* Illustrative screens of a real feature — said so, plainly. */}
      <p className="sj-note">
        <span>Example</span>
        How sharing works on MTONYO+ — these screens are an illustration; your own video appears in its place.
      </p>
      <div className="sj-row">
        <Phone step="1" label="Share your video">
          <div className="sj-video">
            <Poster poster={poster} />
            <span className="sj-video-play">
              <Play size={16} fill="currentColor" />
            </span>
          </div>
          <b className="sj-video-title">{v.title}</b>
          <div className="sj-sheet">
            <span className="sj-sheet-bar">
              <Share2 size={13} />
              Share this video
            </span>
            <span className="share-wa sj-wa">
              <IconWhatsApp size={22} />
              <span className="share-wa-copy">
                <b>Share on WhatsApp</b>
                <small>Chats, groups and Status</small>
              </span>
            </span>
            <div className="sj-targets">
              <span className="share-target is-ig">
                <IconInstagram />
                <b>Instagram</b>
              </span>
              <span className="share-target is-tt">
                <IconTikTok />
                <b>TikTok</b>
              </span>
              <span className="share-target is-fb">
                <IconFacebook />
                <b>Facebook</b>
              </span>
              <span className="share-target is-copy">
                <Link2 size={20} />
                <b>Copy link</b>
              </span>
            </div>
          </div>
        </Phone>

        <span className="sj-arrow" aria-hidden="true">
          <ArrowRight size={18} />
        </span>

        <Phone step="2" label="They receive a preview">
          <div className="sj-chat-head">
            <span className="sj-chat-avatar">
              <IconWhatsApp size={15} />
            </span>
            <span>
              <b>Friends</b>
              <small>WhatsApp</small>
            </span>
          </div>
          <div className="sj-chat">
            <div className="sj-bubble">
              <div className="sj-card">
                <Poster poster={poster} />
                <span className="share-og-veil" />
                <span className="share-og-badge">MTONYO+</span>
                {v.durationSeconds > 0 && (
                  <span className="share-og-time">{duration(v.durationSeconds)}</span>
                )}
                <span className="sj-card-meta">
                  <b>{v.title}</b>
                  {creator && (
                    <small>
                      {creator}
                      {v.creator?.verified && <BadgeCheck size={12} />}
                    </small>
                  )}
                </span>
              </div>
              <span className="sj-card-cta">
                <Play size={13} fill="currentColor" />
                Watch free preview
              </span>
              <span className="sj-link">mtonyoplus.com</span>
              <time>9:41 ✓✓</time>
            </div>
          </div>
        </Phone>

        <span className="sj-arrow" aria-hidden="true">
          <ArrowRight size={18} />
        </span>

        <Phone step="3" label="Preview, pay, keep watching">
          <div className="sj-player">
            <Poster poster={poster} />
            <span className="sj-player-veil">
              <Lock size={18} />
              Free preview ended
            </span>
            <span className="sj-progress">
              <i />
            </span>
          </div>
          <div className="sj-pay">
            <b>Unlock to continue</b>
            {price > 0 && <span className="sj-price">TZS {price.toLocaleString('en-US')}</span>}
            <div className="sj-methods">
              <span className="pm-mpesa">M-Pesa</span>
              <span className="pm-airtel">Airtel Money</span>
            </div>
          </div>
          <span className="sj-paid">
            <CheckCircle2 size={16} />
            <span>
              <b>Payment confirmed</b>
              <small>Resumes where the preview stopped</small>
            </span>
          </span>
          <span className="sj-continue">
            <Play size={14} fill="currentColor" />
            Continue watching
          </span>
        </Phone>
      </div>

      <ol className="sj-steps">
        {['Video', 'Share', 'Preview received', 'Watch free preview', 'Pay', 'Continue watching'].map(
          (t) => (
            <li key={t}>{t}</li>
          )
        )}
      </ol>
    </div>
  )
}

/** A small, honest picture of each capability. No images, no weight. */
const VISUALS = {
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
  const [share, ...rest] = PLATFORM_POWERS

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
          <p>{share.text}</p>
        </div>

        <ShareJourney />

        {/* "Monetize" used to sit here too — it repeated the three earning
            models directly above this section, word for word in places. What
            is left is one wide band: the copy beside its picture. */}
        {rest
          .filter((power) => power.key !== 'monetize')
          .map((power) => (
            <Reveal key={power.key} className={`power is-wide ${power.tone || ''}`.trim()} variant="up">
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
              <div className="power-viz">{VISUALS[power.key]}</div>
            </Reveal>
          ))}

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
