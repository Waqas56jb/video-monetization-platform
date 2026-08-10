import { Lock, Play, Zap } from 'lucide-react'
import { IMG } from '@/data/copy'
import { duration, tzs } from '@/hooks/useApi'
import { mediaUrl } from '@/lib/api'

/**
 * The floating phone showing the paywall as it actually appears.
 *
 * When there is a real video to show, this shows that one — its poster, its
 * title, its price, its free-preview length. When the platform has nothing
 * published yet it falls back to a plain illustration of the mechanic with no
 * invented title and no invented price, because a made-up "TZS 500" beside a
 * made-up artist is exactly the kind of detail people take as a fact.
 */
export default function PhoneMockup({ video, onUnlock }) {
  const hasReal = Boolean(video)

  const poster = mediaUrl(video?.thumbnailUrl) || IMG.premiere
  const title = video?.title || 'Your video, behind a paywall'
  const byline = hasReal
    ? [video.category, video.creator?.name].filter(Boolean).join(' · ')
    : 'This is how buyers see it'

  const previewText = hasReal
    ? video.freePreviewSeconds
      ? `You've watched ${duration(video.freePreviewSeconds)} of ${duration(video.durationSeconds)} free`
      : 'The free preview ends here'
    : 'The preview ends where you decide it ends'

  const label =
    video?.accessType === 'free_with_ads'
      ? 'FREE + ADS'
      : video?.accessType === 'ppv_forever'
        ? 'PAY ONCE'
        : 'PAID PREMIERE'

  const cta = hasReal
    ? video.accessType === 'free_with_ads'
      ? 'WATCH FREE'
      : `UNLOCK FULL VIDEO — ${tzs(video.priceTzs)}`
    : 'UNLOCK FULL VIDEO'

  const runningTime = hasReal && video.durationSeconds ? duration(video.durationSeconds) : null

  /**
   * How the progress bar is divided.
   *
   * Purple is the part already watched, gold is the remainder of the free
   * preview, and the grey behind both is what payment buys. Derived from the
   * video's own numbers so the bar cannot disagree with the sentence under it.
   */
  const total = Number(video?.durationSeconds || 0)
  const previewEnd = Number(video?.freePreviewSeconds || 0)
  const watchedPct = total > 0 ? Math.min(72, Math.round((previewEnd / total) * 100 * 0.8)) : 26
  const freePct = total > 0 ? Math.max(4, Math.round((previewEnd / total) * 100 * 0.2)) : 8

  return (
    <div className="phone">
      <div className="phone-notch" />
      <div className="phone-screen">
        <img src={poster} alt="" loading="eager" fetchPriority="high" decoding="async" />
        <div className="ph-overlay">
          <span className="ph-live">{label}</span>

          {/* The play control, and the running time in the corner where every
              video player in the world puts it. */}
          <button
            className="ph-play"
            onClick={onUnlock}
            aria-label={hasReal ? `Watch ${title}` : 'Explore MTONYO+'}
          >
            <Play />
          </button>
          {runningTime && <span className="ph-duration">{runningTime}</span>}

          <div className="ph-meta">
            <div className="ph-title">{title}</div>
            <div className="ph-artist">{byline}</div>
            {/**
             * Two-tone on purpose: purple is what has been watched, gold is the
             * rest of the free preview, grey is what payment unlocks. The bar is
             * the whole proposition in one line.
             */}
            <div className="ph-progress">
              <span className="pp-watched" style={{ width: `${watchedPct}%` }} />
              <span className="pp-free" style={{ width: `${freePct}%` }} />
            </div>
          </div>
        </div>
        <div className="ph-body">
          <div className="ph-lock">
            <Lock />
            <small>
              <b>Want to keep watching?</b>
              {previewText}
            </small>
          </div>
          <button className="ph-pay" onClick={onUnlock}>
            <Zap />
            {cta}
          </button>
          {/* Named providers plus an honest "more", rather than a list that
              implies these are the only ways to pay. */}
          <div className="ph-secure">
            <Lock size={11} />
            Secure payment
          </div>
          <div className="ph-methods">
            <span>M-PESA</span>
            <span>AIRTEL MONEY</span>
            <span>VISA</span>
            <span className="ph-mc" aria-label="Mastercard">
              <i />
              <i />
            </span>
            <small>+ more</small>
          </div>
        </div>
      </div>
    </div>
  )
}
