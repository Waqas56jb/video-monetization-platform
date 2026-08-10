import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Calendar,
  Clock,
  Eye,
  LayoutDashboard,
  Library,
  Lock,
  Share2,
  Timer,
  Zap,
} from 'lucide-react'
import Logo from '@/components/ui/Logo'
import StreamPlayer from '@/components/watch/StreamPlayer'
import AdBreak from '@/components/watch/AdBreak'
import LockGate from '@/components/watch/LockGate'
import PaymentModal from '@/components/watch/PaymentModal'
import { ErrorState, Skeleton } from '@/components/ui/States'
import useApi, { tzs, compact, duration, shortDate, daysUntil, ACCESS_LABEL } from '@/hooks/useApi'
import api, { getAccessToken, mediaUrl } from '@/lib/api'
import { useToast } from '@/context/ToastContext'

/**
 * Watching a video.
 *
 * The paywall here is not a timer this page enforces. When a viewer has not
 * paid, the server never generates the full video's playback token, so it
 * never reaches the browser — there is nothing in the page to bypass. What
 * arrives is the free preview clip and nothing else. That is why this cannot
 * be defeated with devtools, unlike a client-side counter.
 */
export default function Watch() {
  const { videoId } = useParams()
  const navigate = useNavigate()
  const showToast = useToast()

  const [payOpen, setPayOpen] = useState(false)
  const [previewOver, setPreviewOver] = useState(false)

  /**
   * Where the free preview ran out, so the purchase can carry on from there.
   *
   * Buying a video and being dropped back at 0:00 makes the viewer pay and then
   * re-watch what they had already seen. The furthest second reached during the
   * preview is kept in a ref — it updates several times a second and must not
   * re-render the player — and only becomes `resumeFrom` once payment lands.
   */
  const previewReached = useRef(0)
  const [resumeFrom, setResumeFrom] = useState(0)

  /**
   * Advertising on a free-with-ads video.
   *
   * All three breaks are fetched up front: the mid-roll has to be known before
   * playback reaches the middle. `playedBreaks` is what stops an advert from
   * running again every time the viewer scrubs back over the point it sits at,
   * and `playId` ties every impression from this sitting together so a retried
   * request cannot be billed twice.
   */
  const [activeAd, setActiveAd] = useState(null)
  const playedBreaks = useRef(new Set())
  const mainProgress = useRef(0)
  const [playId] = useState(() =>
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)
  )

  const video = useApi(() => api.videos.one(videoId), [videoId])
  const playback = useApi(() => api.playback(videoId), [videoId])
  const adBreaks = useApi(() => api.ads.breaks(videoId), [videoId])

  const v = video.data?.video
  const p = playback.data
  /**
   * Only decide lock state after playback access is known.
   *
   * While the request is in flight we used to treat every video as locked, which
   * flashed the paywall for a beat on videos the viewer already owns. Wait for
   * the server answer — then show lock UI only when payment is actually required.
   */
  const accessReady = Boolean(p) && !playback.loading
  const locked = accessReady ? !p.access?.canWatchFull : false
  const owned = accessReady && !locked
  const needsPayment = locked && Number(v?.priceTzs || 0) > 0
  const signedIn = Boolean(getAccessToken())

  // A shared link should preview sensibly, and the tab should say what it is.
  useEffect(() => {
    if (!v?.title) return
    document.title = `${v.title} — MTONYO+`
    return () => {
      document.title = "MTONYO+ — Tanzania's Premium Creator Video Platform"
    }
  }, [v?.title])

  useEffect(() => {
    setPreviewOver(false)
    setPayOpen(false)
    setResumeFrom(0)
    previewReached.current = 0
    setActiveAd(null)
    playedBreaks.current = new Set()
    mainProgress.current = 0
  }, [videoId])

  /** The breaks this video carries, by placement. */
  const ads = adBreaks.data?.ads || []
  const adAt = (placement) => ads.find((a) => a.placement === placement) || null

  /**
   * Play a break unless it has already run in this sitting.
   *
   * Without the guard, scrubbing back across a mid-roll would replay the advert
   * every single time — which is both a terrible experience and a way to bill an
   * advertiser repeatedly for one delivery.
   */
  const runBreak = useCallback((placement) => {
    if (playedBreaks.current.has(placement)) return false
    const ad = ads.find((a) => a.placement === placement)
    if (!ad?.iframe) return false
    playedBreaks.current.add(placement)
    setActiveAd(ad)
    return true
  }, [ads])

  const adFinished = useCallback(() => {
    // Coming back from a mid-roll, pick the film up where it was interrupted.
    if (activeAd?.placement === 'mid_roll' && mainProgress.current > 0) {
      setResumeFrom(mainProgress.current)
    }
    setActiveAd(null)
  }, [activeAd?.placement])

  // The pre-roll goes before anything else, once we know the video plays freely.
  useEffect(() => {
    if (!ads.length || activeAd) return
    if (!accessReady || !p?.playback?.iframe) return
    runBreak('pre_roll')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ads.length, accessReady, p?.playback?.iframe])

  // Owned / free videos must never keep a leftover "preview over" lock state.
  useEffect(() => {
    if (accessReady && !locked) {
      setPreviewOver(false)
      setPayOpen(false)
    }
  }, [accessReady, locked])

  /**
   * Preview-end backstop if the Stream SDK never fires `ended` / timeupdate.
   * Only runs once we know the video actually needs payment.
   */
  useEffect(() => {
    if (!needsPayment || previewOver) return
    const stopsAt = Number(p?.playback?.stopsAtSeconds || v?.freePreviewSeconds || 0)
    if (!stopsAt) return

    const timer = setTimeout(() => setPreviewOver(true), (stopsAt + 8) * 1000)
    return () => clearTimeout(timer)
  }, [needsPayment, previewOver, p?.playback?.stopsAtSeconds, v?.freePreviewSeconds])

  // Count the view once, after the player has actually been reached.
  useEffect(() => {
    if (!v?.id) return
    const t = setTimeout(() => api.videos.recordView(v.id, {}).catch(() => {}), 4000)
    return () => clearTimeout(t)
  }, [v?.id])

  const onUnlocked = useCallback(() => {
    setPayOpen(false)
    setPreviewOver(false)

    // Carry on from where the preview stopped rather than restarting the film.
    // `stopsAtSeconds` is the floor: if the SDK never reported a time we still
    // know the preview could not have run past the point the server cut it at.
    const stopsAt = Number(p?.playback?.stopsAtSeconds || v?.freePreviewSeconds || 0)
    const from = Math.max(previewReached.current, stopsAt)
    setResumeFrom(from)

    showToast(
      from > 5
        ? `Unlocked — picking up from ${duration(Math.floor(from))}`
        : 'Unlocked — this video is yours forever'
    )
    playback.reload()
    video.reload({ quiet: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback, video, showToast, p?.playback?.stopsAtSeconds, v?.freePreviewSeconds])

  const share = async () => {
    const url = `${window.location.origin}/watch/${v?.slug || v?.id}`
    try {
      if (navigator.share) {
        await navigator.share({ title: v.title, text: `Watch "${v.title}" on MTONYO+`, url })
        return
      }
      await navigator.clipboard.writeText(url)
      showToast('Link copied — share it anywhere')
    } catch (err) {
      if (err?.name === 'AbortError') return
      showToast(url)
    }
  }

  /* ------------------------------------------------------------ shells */

  if (video.loading) {
    return (
      <Shell>
        <div className="watch-wrap">
          <div className="skeleton skeleton-player" />
          <div className="watch-info">
            <Skeleton rows={3} />
          </div>
        </div>
      </Shell>
    )
  }

  if (video.error || !v) {
    return (
      <Shell>
        <div className="watch-wrap">
          <div className="watch-info">
            <ErrorState
              title="This video isn't available"
              error={video.error || 'It may have been removed, or the link may be wrong.'}
              onRetry={video.reload}
            />
            <button className="btn btn-gold" onClick={() => navigate('/explore')}>
              Browse other videos
            </button>
          </div>
        </div>
      </Shell>
    )
  }

  const premiereDays = daysUntil(v.premiereEndsAt)
  /** How much of the film is behind the paywall — the part worth paying for. */
  const lockedRemainder = Math.max(
    0,
    Number(v.durationSeconds || 0) - Number(v.freePreviewSeconds || 0)
  )
  /** After preview: cinematic lock on the player — payment sheet only on tap. */
  const showLockGate = needsPayment && (previewOver || (accessReady && !p?.playback?.iframe))

  const openCheckout = () => {
    if (!needsPayment) return
    if (!signedIn) {
      navigate('/login', { state: { from: `/watch/${videoId}` } })
      return
    }
    setPayOpen(true)
  }

  return (
    <Shell>
      <div className="watch-wrap">
        <div className={`player ${showLockGate ? 'is-gated' : ''}`.trim()}>
          <button className="pl-back" onClick={() => navigate(-1)} aria-label="Go back">
            <ArrowLeft />
          </button>

          {playback.loading || !accessReady ? (
            <div className="stream-shell is-booting">
              {v.thumbnailUrl ? (
                <img
                  className="stream-poster"
                  src={mediaUrl(v.thumbnailUrl)}
                  alt=""
                  draggable={false}
                />
              ) : (
                <div className="stream-poster stream-poster-fallback" aria-hidden="true" />
              )}
            </div>
          ) : activeAd ? (
            <AdBreak ad={activeAd} videoId={v.id} playId={playId} onFinished={adFinished} />
          ) : p?.playback?.iframe ? (
            <>
              <StreamPlayer
                src={p.playback.iframe}
                poster={mediaUrl(v.thumbnailUrl)}
                title={v.title}
                /* Only the purchased video resumes. Starting the *preview* part
                   way in would hand the viewer a clip that is already over. */
                startAt={owned ? resumeFrom : 0}
                playOnReady={owned && resumeFrom > 0}
                onEnded={() => {
                  if (needsPayment) {
                    setPreviewOver(true)
                    return
                  }
                  runBreak('post_roll')
                }}
                onTimeUpdate={(current) => {
                  if (needsPayment) previewReached.current = Math.max(previewReached.current, current)
                  const stopsAt = p.playback?.stopsAtSeconds || v.freePreviewSeconds
                  if (needsPayment && stopsAt && current >= stopsAt - 0.4) setPreviewOver(true)

                  if (!needsPayment) {
                    mainProgress.current = current
                    const mid = adAt('mid_roll')
                    if (mid?.atSeconds != null && current >= mid.atSeconds) runBreak('mid_roll')
                  }
                }}
              />
              {needsPayment && !previewOver && (
                /* Spell out how much of the film this preview is. The client
                   could not tell a paid video from a free one because nothing
                   on screen said the video ran longer than the preview. */
                <div className="preview-flag">
                  <Lock size={13} />
                  Free preview
                  {v.freePreviewSeconds ? ` · ${duration(v.freePreviewSeconds)}` : ''}
                  {v.durationSeconds ? ` of ${duration(v.durationSeconds)}` : ''}
                </div>
              )}
            </>
          ) : (
            <div className="player-empty">
              <AlertTriangle />
              <b>{p?.note || 'This video is not ready to play yet'}</b>
              <p>Try again in a few minutes.</p>
            </div>
          )}

          {showLockGate && (
            <LockGate priceLabel={tzs(v.priceTzs)} onUnlock={openCheckout} />
          )}
        </div>

        {/* Compact unlock CTA under the player — never auto-open the payment sheet. */}
        {needsPayment && (
          <div className={`unlock-bar ${previewOver ? 'is-urgent' : ''}`.trim()}>
            <div className="ub-text">
              <Lock size={15} />
              <span>
                {previewOver ? (
                  <>
                    {lockedRemainder
                      ? `Preview ended · ${duration(lockedRemainder)} still locked · `
                      : 'Preview ended · '}
                    <b>{tzs(v.priceTzs)}</b> to unlock forever
                  </>
                ) : (
                  <>
                    <b>{tzs(v.priceTzs)}</b> to watch all {duration(v.durationSeconds)}
                    {v.freePreviewSeconds ? ` · ${duration(v.freePreviewSeconds)} free preview` : ''}
                  </>
                )}
              </span>
            </div>
            <button className="btn btn-gold btn-sm" onClick={openCheckout}>
              <Zap />
              Unlock now
            </button>
          </div>
        )}

        <div className="watch-info">
          <div className="watch-info-top">
            <div>
              <h1>{v.title}</h1>
              <div className="meta">
                {v.durationSeconds > 0 && (
                  <span>
                    <Timer />
                    {duration(v.durationSeconds)}
                    {needsPayment && v.freePreviewSeconds > 0 && (
                      <>
                        {' '}
                        <span className="meta-locked">
                          · {duration(v.freePreviewSeconds)} free
                        </span>
                      </>
                    )}
                  </span>
                )}
                <span>
                  <Eye />
                  {compact(v.views)} views
                </span>
                {v.publishedAt && (
                  <span>
                    <Calendar />
                    {shortDate(v.publishedAt)}
                  </span>
                )}
                <span>
                  <Clock />
                  {ACCESS_LABEL[v.accessType] || v.accessType}
                </span>
              </div>
            </div>
            <div className="watch-actions">
              {owned && (
                <span className="owned-badge">
                  <BadgeCheck size={14} />
                  <span className="ob-full">In your library</span>
                  <span className="ob-short">Owned</span>
                </span>
              )}
              <button className="btn btn-ghost btn-sm" onClick={share}>
                <Share2 />
                <span className="btn-label">Share</span>
              </button>
            </div>
          </div>

          {v.creator && (
            <div className="creator-row">
              {v.creator.avatarUrl ? (
                <img src={v.creator.avatarUrl} alt="" />
              ) : (
                <span className="creator-initials">{initials(v.creator.name)}</span>
              )}
              <div>
                <b>{v.creator.name}</b>
                <small>{v.category || 'Creator on MTONYO+'}</small>
              </div>
            </div>
          )}

          {v.description && <div className="watch-desc">{v.description}</div>}

          <div className="watch-terms">
            <b>{ACCESS_LABEL[v.accessType]}</b>{' '}
            {v.accessType === 'paid_premiere'
              ? premiereDays != null
                ? `— pay ${tzs(v.priceTzs)} to watch now. After ${premiereDays} more day${premiereDays === 1 ? '' : 's'} this becomes free with ads, and anyone who paid keeps it forever.`
                : `— pay ${tzs(v.priceTzs)} to watch now. When the premiere window closes it becomes free with ads, and anyone who paid keeps it forever.`
              : v.accessType === 'free_with_ads'
                ? '— free to watch. The creator earns from the advertising shown before it.'
                : `— pay ${tzs(v.priceTzs)} once and it is yours permanently, on any device you log into.`}
          </div>
        </div>
      </div>

      <PaymentModal
        open={payOpen}
        video={v}
        onClose={() => setPayOpen(false)}
        onUnlocked={onUnlocked}
        onGoToLibrary={() => {
          setPayOpen(false)
          navigate('/dashboard')
        }}
      />
    </Shell>
  )
}

function Shell({ children }) {
  const navigate = useNavigate()
  return (
    <div className="page">
      <header className="scrolled watch-header">
        <div className="container nav">
          <Logo />
          <div className="nav-cta watch-cta">
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard')}>
              <Library />
              <span className="btn-label">My Library</span>
            </button>
            <button className="btn btn-gold btn-sm" onClick={() => navigate('/dashboard')}>
              <LayoutDashboard />
              <span className="btn-label">Dashboard</span>
            </button>
          </div>
        </div>
      </header>
      {children}
    </div>
  )
}

const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join('') || '?'
