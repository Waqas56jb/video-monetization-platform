import { useCallback, useEffect, useState } from 'react'
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
  Zap,
} from 'lucide-react'
import Logo from '@/components/ui/Logo'
import StreamPlayer from '@/components/watch/StreamPlayer'
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

  const video = useApi(() => api.videos.one(videoId), [videoId])
  const playback = useApi(() => api.playback(videoId), [videoId])

  const v = video.data?.video
  const p = playback.data
  const locked = p ? !p.access?.canWatchFull : false
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
  }, [videoId])

  /**
   * And a second backstop, for the case where the SDK never loads at all: then
   * there are no time updates either, and the two checks above would both stay
   * silent. Once the preview has been on screen for its own length plus a
   * little slack, the offer appears regardless.
   *
   * Belt and braces on purpose. Everything else here is enforced by the server
   * — the full video's token is never issued to someone who has not paid — so
   * this is only about *asking* for the money at the right moment. Failing to
   * ask is the one failure the server cannot cover for.
   */
  useEffect(() => {
    if (!locked || previewOver) return
    const stopsAt = Number(p?.playback?.stopsAtSeconds || v?.freePreviewSeconds || 0)
    if (!stopsAt) return

    const timer = setTimeout(() => setPreviewOver(true), (stopsAt + 8) * 1000)
    return () => clearTimeout(timer)
  }, [locked, previewOver, p?.playback?.stopsAtSeconds, v?.freePreviewSeconds])

  // Count the view once, after the player has actually been reached.
  useEffect(() => {
    if (!v?.id) return
    const t = setTimeout(() => api.videos.recordView(v.id, {}).catch(() => {}), 4000)
    return () => clearTimeout(t)
  }, [v?.id])

  const onUnlocked = useCallback(() => {
    setPayOpen(false)
    setPreviewOver(false)
    showToast('Unlocked — this video is yours forever')
    playback.reload()
    video.reload({ quiet: true })
  }, [playback, video, showToast])

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
  const showPaywall = locked && (previewOver || !p?.playback)

  /**
   * Three ways the paywall can be reached, on purpose.
   *
   * `ended` from Cloudflare's player SDK is the precise one, but it is a
   * third-party script: if it is blocked, slow, or changes, the event never
   * fires and the preview simply stops with nothing asking for payment. That
   * is exactly what was happening. So the player's own clock is watched as
   * well, and a plain timer covers the case where the SDK never loads at all
   * and there are no clock updates either.
   *
   * Everything else is enforced by the server — someone who has not paid is
   * never issued the full video's token — so this is only about *asking* for
   * the money at the right moment. Failing to ask is the one thing the server
   * cannot cover for.
   */

  return (
    <Shell>
      <div className="watch-wrap">
        <div className="player">
          <button className="pl-back" onClick={() => navigate(-1)} aria-label="Go back">
            <ArrowLeft />
          </button>

          {playback.loading ? (
            <div className="skeleton skeleton-player" />
          ) : p?.playback?.iframe ? (
            <>
              <StreamPlayer
                src={p.playback.iframe}
                poster={mediaUrl(v.thumbnailUrl)}
                title={v.title}
                onEnded={() => locked && setPreviewOver(true)}
                onTimeUpdate={(current) => {
                  const stopsAt = p.playback?.stopsAtSeconds || v.freePreviewSeconds
                  if (locked && stopsAt && current >= stopsAt - 0.4) setPreviewOver(true)
                }}
              />
              {locked && !previewOver && (
                <div className="preview-flag">
                  <Lock size={13} />
                  Free preview
                  {v.freePreviewSeconds ? ` · ${duration(v.freePreviewSeconds)}` : ''}
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

          {showPaywall && (
            <div className="paywall">
              <div className="paywall-card">
                <span className="pw-ic">
                  <Lock />
                </span>
                <h3>{previewOver ? 'That was the free preview' : 'Unlock this video'}</h3>
                <p>
                  {v.accessType === 'paid_premiere' && premiereDays != null
                    ? `Pay once to watch it all now. In ${premiereDays} day${premiereDays === 1 ? '' : 's'} it becomes free with ads — but you keep this copy either way.`
                    : 'Pay once with mobile money and it stays in your library forever, on every device.'}
                </p>

                <div className="pw-price">
                  <b>{tzs(v.priceTzs)}</b>
                  <small>one payment · yours forever</small>
                </div>

                {signedIn ? (
                  <button className="btn btn-gold btn-block" onClick={() => setPayOpen(true)}>
                    <Zap />
                    Unlock with M-Pesa or Airtel
                  </button>
                ) : (
                  <button
                    className="btn btn-gold btn-block"
                    onClick={() => navigate('/login', { state: { from: `/watch/${videoId}` } })}
                  >
                    <Zap />
                    Log in to unlock
                  </button>
                )}

                {/* Never a dead end: the viewer can always get out. */}
                <button className="btn btn-ghost btn-block" onClick={() => navigate('/explore')}>
                  Not now — keep browsing
                </button>
              </div>
            </div>
          )}
        </div>

        {/* A locked video shows its price and its way in from the start.
            Making somebody sit through the preview before they can even see
            what it costs is a way to lose the sale, not to protect it. */}
        {locked && !showPaywall && (
          <div className="unlock-bar">
            <div className="ub-text">
              <Lock size={15} />
              <span>
                <b>{tzs(v.priceTzs)}</b> to watch it all
                {v.freePreviewSeconds ? ` · ${duration(v.freePreviewSeconds)} free preview` : ''}
              </span>
            </div>
            {signedIn ? (
              <button className="btn btn-gold btn-sm" onClick={() => setPayOpen(true)}>
                <Zap />
                Unlock now
              </button>
            ) : (
              <button
                className="btn btn-gold btn-sm"
                onClick={() => navigate('/login', { state: { from: `/watch/${videoId}` } })}
              >
                <Zap />
                Log in to unlock
              </button>
            )}
          </div>
        )}

        <div className="watch-info">
          <div className="watch-info-top">
            <div>
              <h1>{v.title}</h1>
              <div className="meta">
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
              {!locked && (
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
