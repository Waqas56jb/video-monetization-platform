import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Calendar,
  Clock,
  Eye,
  Flag,
  Lock,
  Share2,
  Timer,
  Zap,
} from 'lucide-react'
import Header from '@/components/layout/Header'
import StreamPlayer from '@/components/watch/StreamPlayer'
import AdBreak from '@/components/watch/AdBreak'
import LockGate from '@/components/watch/LockGate'
import PaymentModal from '@/components/watch/PaymentModal'
import ShareSheet from '@/components/watch/ShareSheet'
import ReportDialog from '@/components/watch/ReportDialog'
import MoreLikeThis from '@/components/watch/MoreLikeThis'
import BusyButton from '@/components/ui/BusyButton'
import { ErrorState } from '@/components/ui/States'
import useApi, { tzs, compact, duration, shortDate, daysUntil, ACCESS_LABEL } from '@/hooks/useApi'
import api, { getAccessToken, mediaUrl } from '@/lib/api'
import { resumePoint } from '@/lib/resumePoint'
import { useToast } from '@/context/ToastContext'
import { authUrl } from '@/lib/nextPath'
import useGoBack from '@/hooks/useGoBack'
import { rememberProgress, recallProgress, forgetProgress } from '@/lib/watchProgress'
import { warmShareFromMeta, healShareCard } from '@/lib/warmShare'
import { videoRouteMatches } from '@/lib/watchUrl'
import { takeWarmedVideo } from '@/lib/prefetchWatch'
import { useProgress } from '@/context/ProgressContext'
import WatchSkeleton from '@/components/watch/WatchSkeleton'

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
  const location = useLocation()
  const showToast = useToast()
  const goBack = useGoBack('/explore')
  const { stop: stopProgress } = useProgress()
  const routePreview = location.state?.preview

  const [payOpen, setPayOpen] = useState(false)
  const [previewOver, setPreviewOver] = useState(false)
  /* The share sheet — what is going out, shown before it goes. */
  const [sharing, setSharing] = useState(false)
  const [shareOpening, setShareOpening] = useState(false)
  const [shareLive, setShareLive] = useState(null)
  /* Reporting, from the video itself rather than an address on a policy page. */
  const [reporting, setReporting] = useState(false)

  /**
   * Where to pick the film up from.
   *
   * Buying a video and being dropped back at 0:00 makes the viewer pay and then
   * re-watch what they had already seen. The authority on this is the server —
   * `playback.resumeFromSeconds`, stored per viewer per video — because the page
   * reloads its playback the moment payment lands, and anything held only in
   * memory here would be gone by then. That was the first attempt at this, and
   * it is why the client found the video restarting.
   *
   * `resumeHint` is the local copy used immediately after payment so the resume
   * does not have to wait for a round trip; the server's answer wins as soon as
   * it arrives, and is the only thing that works after a refresh.
   */
  const lastReported = useRef(0)
  const watchedTo = useRef(0)
  const [resumeHint, setResumeHint] = useState(0)
  const [justPaid, setJustPaid] = useState(false)
  /* Full video has actually started after purchase — overlay can drop. */
  const [continueReady, setContinueReady] = useState(false)

  /**
   * Advertising on a Free + Ads video.
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
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `00000000-0000-4000-8000-${String(Date.now()).padStart(12, '0').slice(-12)}`
  )

  const video = useApi(
    () => takeWarmedVideo(videoId) || api.videos.one(videoId),
    [videoId]
  )
  const playback = useApi(() => api.playback(videoId), [videoId], { timeoutMs: 20_000 })
  const adBreaks = useApi(() => api.ads.breaks(videoId), [videoId])

  /* Drop the top progress bar once this page has painted a shell. */
  useEffect(() => {
    stopProgress()
  }, [stopProgress, videoId])

  const v = video.data?.video
  const share = shareLive ?? video.data?.share
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
  const owned = justPaid || (accessReady && !locked)
  const needsPayment = locked && Number(v?.priceTzs || 0) > 0 && !justPaid
  const signedIn = Boolean(getAccessToken())

  // A shared link should preview sensibly, and the tab should say what it is.
  useEffect(() => {
    if (!v?.title) return
    document.title = `${v.title} — MTONYO+`
    return () => {
      document.title = "MTONYO+ — Tanzania's Premium Creator Video Platform"
    }
  }, [v?.title])

  /**
   * One clean permanent address per video: /watch/video-title
   *
   * Shared /s/ links and old UUID links still open this page, then the bar
   * is replaced with the slug so Copy, Share and the address bar all agree.
   *
   * Only run once the loaded row matches the route — otherwise a click on
   * "More like this" still has the previous video in memory and this effect
   * would replace the new URL with the old slug before the fetch finishes.
   */
  useEffect(() => {
    if (!v?.slug || !videoRouteMatches(videoId, v)) return
    const shareAlias = location.pathname.startsWith('/s/')
    if (!shareAlias && videoId === v.slug) return
    navigate(`/watch/${v.slug}${location.search || ''}`, { replace: true })
  }, [v?.slug, v?.id, videoId, location.pathname, location.search, navigate])

  useEffect(() => {
    setShareLive(null)
  }, [videoId])

  useEffect(() => {
    if (!video.data?.share) return
    setShareLive(video.data.share)
  }, [video.data?.share])

  /**
   * Build the WhatsApp/Facebook poster before anyone pastes the link.
   * Cards are built at publish time; this only warms caches and self-heals rare misses.
   */
  useEffect(() => {
    if (!share?.watchUrl) return
    warmShareFromMeta(share)
    if (share.cardStatus && share.cardStatus !== 'ready' && v?.slug) {
      healShareCard(v.slug, (meta) => setShareLive((prev) => ({ ...prev, ...meta })))
    }
  }, [share, v?.slug])

  const primeShare = () => {
    if (share?.watchUrl) warmShareFromMeta(share)
  }

  const openShare = () => {
    setShareOpening(true)
    requestAnimationFrame(() => {
      setSharing(true)
      setShareOpening(false)
    })
  }

  useEffect(() => {
    if (!v?.slug) return
    const params = new URLSearchParams(location.search)
    if (params.get('share') !== '1') return
    setSharing(true)
    params.delete('share')
    const q = params.toString()
    navigate(`${location.pathname}${q ? `?${q}` : ''}`, { replace: true })
  }, [v?.slug, location.search, location.pathname, navigate])

  useEffect(() => {
    setPreviewOver(false)
    setPayOpen(false)
    setJustPaid(false)
    setContinueReady(false)
    setResumeHint(0)
    lastReported.current = 0
    watchedTo.current = 0
    setActiveAd(null)
    playedBreaks.current = new Set()
    mainProgress.current = 0
  }, [videoId])

  /**
   * Report the position, at most every few seconds.
   *
   * A player reports its time several times a second; sending each one would be
   * a request per frame for no extra accuracy. Ten seconds is close enough to
   * resume from and cheap enough to ignore.
   */
  const reportProgress = useCallback(
    (seconds, { force = false } = {}) => {
      const s = Math.floor(seconds || 0)
      if (!force && Math.abs(s - lastReported.current) < 10) return
      lastReported.current = s

      /**
       * This device first, always.
       *
       * A signed-out visitor watching a preview has no account to record against
       * yet, and they are exactly the person who is about to sign in and expect
       * the video to carry on. Keeping it locally covers them; the server copy is
       * written as well whenever we know who they are.
       */
      rememberProgress(videoId, s)
      if (!signedIn || !v?.id) return

      api.saveProgress(v.id, s).catch(() => {
        /* A lost resume point is not worth interrupting playback over. */
      })
    },
    [signedIn, v?.id, videoId]
  )

  /**
   * Hand a position recorded before signing in over to the account.
   *
   * Runs once we know both who they are and which video this is, so the position
   * they reached as a visitor becomes part of their history rather than being
   * stranded in this tab.
   */
  useEffect(() => {
    if (!signedIn || !v?.id) return
    const local = recallProgress(videoId)
    if (local <= 0) return
    api
      .saveProgress(v.id, local)
      .then(() => {
        // The account owns the position now; a second copy could only go stale.
        forgetProgress(videoId)
        playback.reload({ quiet: true })
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, v?.id])

  /* Leaving the page mid-film should still be resumable. */
  useEffect(() => {
    const flush = () => {
      if (watchedTo.current > 0) reportProgress(watchedTo.current, { force: true })
    }
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [reportProgress])

  /**
   * Pick up an interrupted purchase.
   *
   * Somebody who tapped Unlock, was asked to sign in, and has just come back was
   * halfway through buying this video. Handing them the payment sheet finishes
   * what they started; making them find the button again is the platform
   * forgetting what they were doing. `?unlock=1` is dropped from the URL once
   * used, so a refresh later does not reopen it out of nowhere.
   */
  useEffect(() => {
    if (!new URLSearchParams(location.search).get('unlock')) return
    if (!signedIn || !accessReady || !v?.id) return

    if (needsPayment) setPayOpen(true)
    navigate(`/watch/${v.slug || videoId}`, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, signedIn, accessReady, needsPayment, v?.id, v?.slug, videoId])

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
    if (!p?.access?.showsAds) return false
    if (playedBreaks.current.has(placement)) return false
    const ad = ads.find((a) => a.placement === placement)
    if (!ad?.iframe) return false
    playedBreaks.current.add(placement)
    setActiveAd(ad)
    return true
  }, [ads, p?.access?.showsAds])

  const adFinished = useCallback(() => {
    if (activeAd?.placement === 'mid_roll' && mainProgress.current > 0) {
      setResumeHint(mainProgress.current)
    }
    setActiveAd(null)
  }, [activeAd?.placement])

  // The pre-roll goes before anything else, once we know the video plays freely.
  // Wait until the breaks request has finished — otherwise the film starts, then
  // an advert interrupts it a moment later, which looks like a broken player.
  useEffect(() => {
    if (!p?.access?.showsAds) return
    if (adBreaks.loading) return
    if (!ads.length || activeAd) return
    if (!accessReady || !p?.playback?.iframe) return
    runBreak('pre_roll')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adBreaks.loading, ads.length, accessReady, p?.playback?.iframe, p?.access?.showsAds])

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
    /* The rule itself lives in resumePoint, with the client's exact report
       written down as a test. Keeping it there means the behaviour they
       disputed cannot be changed by accident. */
    const from = resumePoint({
      watchedTo: watchedTo.current,
      remembered: recallProgress(videoId),
      stopsAt: Number(p?.playback?.stopsAtSeconds || v?.freePreviewSeconds || 0),
      previewEnded: previewOver,
    })
    watchedTo.current = from
    rememberProgress(videoId, from, { force: true })

    setJustPaid(true)
    setContinueReady(false)
    setPayOpen(false)
    setPreviewOver(false)
    setResumeHint(from)

    showToast(
      from > 5
        ? `Unlocked — continuing from ${duration(Math.floor(from))}`
        : 'Unlocked — continuing the video'
    )

    const saveThenReload = async () => {
      if (from > 0 && v?.id) {
        try {
          await api.saveProgress(v.id, Math.floor(from))
        } catch {
          /* local hint still holds this tab */
        }
      }
      playback.reload({ quiet: true })
      video.reload({ quiet: true })
    }
    saveThenReload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback, video, showToast, p?.playback?.stopsAtSeconds, v?.freePreviewSeconds, v?.id, previewOver, videoId])

  /**
   * Paying is the decision. Do not leave a veil up if autoplay is blocked —
   * uncover the player so one tap can start it, never two screens of Watch Now.
   */
  useEffect(() => {
    if (!justPaid || continueReady) return
    const t = setTimeout(() => setContinueReady(true), 3500)
    return () => clearTimeout(t)
  }, [justPaid, continueReady])

  /**
   * Sharing moved into its own sheet.
   *
   * The sheet shares the watch URL only. A caption or a clip file made WhatsApp
   * send a paragraph plus a tiny website icon instead of the video poster card.
   */

  /* ------------------------------------------------------------ shells */

  const videoReady = v && videoRouteMatches(videoId, v)

  /* Paint from card data immediately — never a blank wait for the API. */
  if ((video.loading || !videoReady) && !(video.error && !v)) {
    return (
      <Shell>
        <WatchSkeleton preview={routePreview} />
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
  /**
   * A converted premiere still has a purchase. The access type is Free + Ads
   * for everyone else, but the person who paid during the window keeps the
   * copy they bought — that is the claim on the homepage, and it has to be
   * visible on this page after the job has flipped the video.
   */
  const boughtDuringPremiere =
    Boolean(p?.access?.owned && p?.access?.purchasedAt) &&
    (v.accessType === 'paid_premiere' || v.accessType === 'free_with_ads')
  /**
   * Native Free + Ads titles never sold. A Free + Ads film that still has
   * unlocks is one whose 30/60/90 window closed — the conversion the homepage
   * promises, visible without signing in.
   */
  const wasPremiere = v.accessType === 'free_with_ads' && Number(v.paidUnlocks || 0) > 0

  const previewSeconds = Number(p?.playback?.stopsAtSeconds || v.freePreviewSeconds || 0)

  /**
   * Where playback actually begins.
   *
   * The server's figure wins — it is the only one that survives a refresh. The
   * local hint fills the gap between paying and the reloaded playback arriving,
   * and a mid-roll returning the viewer to the middle of the film also lands here.
   */
  const resumeAt = justPaid
    ? /* The moment they pay, where they were in this tab is the truth. The
         server's figure can still be a stale, larger number from an earlier
         visit, and taking the larger of the two would throw them forward
         past film they have not seen. */
      resumeHint
    : Math.max(
        Number(p?.playback?.resumeFromSeconds || 0),
        resumeHint,
        /* Covers the visitor who watched the preview before signing in — the
           server had nobody to record it against at the time. */
        recallProgress(videoId)
      )

  /** Why this video is playing in full — see the badge below. */
  const accessReason = (() => {
    const a = p?.access
    if (a?.owned) return { full: 'In your library', short: 'Library', tone: '' }
    if (a?.isOwner) return { full: 'Your own video', short: 'Yours', tone: 'is-note' }
    if (a?.isStaff) {
      return { full: 'Open to you as staff — not a purchase', short: 'Staff', tone: 'is-note' }
    }
    if (v?.accessType === 'free_with_ads') return { full: 'Free + Ads', short: 'Free', tone: 'is-note' }
    return { full: 'In your library', short: 'Library', tone: '' }
  })()
  /** How much of the film is behind the paywall — the part worth paying for. */
  const lockedRemainder = Math.max(0, Number(v.durationSeconds || 0) - previewSeconds)
  /** After preview: cinematic lock on the player — payment sheet only on tap. */
  const showLockGate = needsPayment && (previewOver || (accessReady && !p?.playback?.iframe))

  const openCheckout = () => {
    if (!needsPayment) return
    if (!signedIn) {
      /**
       * Send them to sign in, and remember both where they were and what they
       * were in the middle of.
       *
       * `next` goes in the URL so it survives a reload and the detour through
       * Sign up; `unlock=1` is how we know, on the way back, that they were
       * partway through buying and should be handed the payment sheet rather
       * than left to find the button again.
       *
       * Their position in the preview is already in session storage, so the
       * video also resumes where it stopped.
       */
      rememberProgress(videoId, watchedTo.current)
      /* `unlock=1` belongs INSIDE the destination, not beside it: the login page
         navigates to `next` and anything sitting next to it is left behind. */
      navigate(authUrl('login', `/watch/${videoId}?unlock=1`))
      return
    }
    setPayOpen(true)
  }

  return (
    <Shell>
      <div className="watch-wrap">
        <div className={`player ${showLockGate ? 'is-gated' : ''}`.trim()}>
          {/* Somebody who opened this on a shared link has nothing of ours
              behind them, and a bare navigate(-1) would take them off the site
              — back to WhatsApp, usually. Explore is the useful destination
              there. */}
          <button className="pl-back" onClick={goBack} aria-label="Go back">
            <ArrowLeft />
          </button>

          {playback.loading && !p?.playback?.iframe ? (
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
          ) : p?.access?.showsAds && adBreaks.loading && !activeAd ? (
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
              <p className="stream-boot-msg">Loading advert…</p>
            </div>
          ) : playback.error && !p?.playback?.iframe ? (
            <div className="player-empty">
              <AlertTriangle />
              <b>This video could not start</b>
              <p>
                {playback.error && playback.error !== 'Something went wrong'
                  ? playback.error
                  : 'Check your connection and try again. Nothing was charged.'}
              </p>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => playback.reload()}>
                Try again
              </button>
            </div>
          ) : activeAd ? (
            <AdBreak ad={activeAd} videoId={v.id} playId={playId} onFinished={adFinished} />
          ) : p?.playback?.iframe ? (
            <>
              <StreamPlayer
                key={`${v.id}-${justPaid ? 'paid' : p.playback.kind}-${Math.floor(resumeAt)}`}
                src={p.playback.iframe}
                poster={mediaUrl(v.thumbnailUrl)}
                title={v.title}
                /* The server's stored position is the authority; the local hint
                   only covers the moment straight after payment, before the
                   reloaded playback has come back. */
                startAt={resumeAt}
                autoplay
                playOnReady
                /**
                 * Where the free preview ends, enforced by the player itself.
                 *
                 * The page used to do this by showing the paywall over the
                 * top when the clock passed the number — which never stopped
                 * the film. The preview is its own Cloudflare clip, cut when
                 * previews were five minutes long, so a video stating 3:37
                 * kept playing underneath the paywall until 5:00.
                 */
                stopAt={needsPayment ? previewSeconds : 0}
                onStopReached={() => {
                  watchedTo.current = Math.max(watchedTo.current, previewSeconds)
                  rememberProgress(videoId, watchedTo.current, { force: true })
                  setPreviewOver(true)
                  reportProgress(previewSeconds, { force: true })
                }}
                onPlaying={() => setContinueReady(true)}
                onRetry={() => playback.reload()}
                onEnded={() => {
                  if (needsPayment) {
                    watchedTo.current = Math.max(watchedTo.current, previewSeconds)
                    rememberProgress(videoId, watchedTo.current, { force: true })
                    setPreviewOver(true)
                    reportProgress(previewSeconds, { force: true })
                    return
                  }
                  runBreak('post_roll')
                }}
                onTimeUpdate={(current) => {
                  const prev = watchedTo.current
                  if (current < 2 && prev > 8) {
                    /* Preview clip reset to 0 after ending — keep the stop. */
                  } else {
                    watchedTo.current = Math.max(prev, current || 0)
                  }
                  reportProgress(watchedTo.current)

                  if (needsPayment && previewSeconds && current >= previewSeconds - 0.4) {
                    watchedTo.current = Math.max(watchedTo.current, previewSeconds)
                    setPreviewOver(true)
                    reportProgress(previewSeconds, { force: true })
                  }

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
                  {previewSeconds ? ` · ${duration(previewSeconds)}` : ''}
                  {v.durationSeconds ? ` of ${duration(v.durationSeconds)}` : ''}
                </div>
              )}
            </>
          ) : (
            <div className="player-empty">
              <AlertTriangle />
              <b>{p?.note || 'This video is not ready to play yet'}</b>
              <p>Check your connection, or try again in a moment.</p>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => playback.reload()}>
                Try again
              </button>
            </div>
          )}

          {justPaid && !continueReady && (
            <div className="continue-veil" aria-live="polite">
              <span className="pay-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <b>Unlocked</b>
              <small>Continuing from where the preview stopped…</small>
            </div>
          )}

          {showLockGate && (
            <LockGate
              priceLabel={tzs(v.priceTzs)}
              /* The gate says what this particular release model buys. */
              accessType={v.accessType}
              onUnlock={openCheckout}
            />
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
                    <b>{tzs(v.priceTzs)}</b> to unlock it
                  </>
                ) : (
                  <>
                    <b>{tzs(v.priceTzs)}</b> to watch all {duration(v.durationSeconds)}
                    {previewSeconds ? ` · ${duration(previewSeconds)} free preview` : ''}
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
                    {needsPayment && previewSeconds > 0 && (
                      <>
                        {' '}
                        <span className="meta-locked">
                          · {duration(previewSeconds)} free
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
              {/**
                * Say WHY this is unlocked, not just that it is.
                *
                * Access can come from four different places — a purchase, being
                * the creator, being staff, or the video being free — and they
                * look identical on screen. That is how an administrator browsing
                * the public site concludes the paywall has failed: every video
                * opens for them, because reviewing content means watching it.
                * Naming the reason turns that into information.
                */}
              {owned && (
                <span className={`owned-badge ${accessReason.tone}`.trim()}>
                  <BadgeCheck size={14} />
                  <span className="ob-full">{accessReason.full}</span>
                  <span className="ob-short">{accessReason.short}</span>
                </span>
              )}
              <BusyButton
                className="btn btn-ghost btn-sm"
                busy={shareOpening}
                icon={Share2}
                onPointerEnter={primeShare}
                onTouchStart={primeShare}
                onFocus={primeShare}
                onClick={openShare}
              >
                <span className="btn-label">Share</span>
              </BusyButton>
            </div>
          </div>

          {v.creator && (
            <Link
              className="creator-row"
              to={v.creator.id ? `/creator/${v.creator.id}` : '/explore'}
            >
              {v.creator.avatarUrl ? (
                <img src={mediaUrl(v.creator.avatarUrl)} alt="" />
              ) : (
                <span className="creator-initials">{initials(v.creator.name)}</span>
              )}
              <div>
                <b>
                  {v.creator.name}
                  {v.creator.verified && (
                    <BadgeCheck className="verified-tick" aria-label="Verified creator" />
                  )}
                </b>
                <small>View creator profile</small>
              </div>
              <span className="btn btn-ghost btn-sm">Profile</span>
            </Link>
          )}

          {v.description && <div className="watch-desc">{v.description}</div>}

          {/* Quiet on purpose: a report link that competes with Share invites
              misuse, and one that cannot be found protects nobody. */}
          <button className="report-link" onClick={() => setReporting(true)}>
            <Flag size={13} />
            Report this video
          </button>

          {/**
           * The promise a premiere buyer most needs to see, and the one most
           * easily misread: the window ending does not take anything from them.
           * Only shown to somebody who actually holds the entitlement.
           */}
          {p?.access?.owned && v.isPublished === false && (
            <div className="watch-assure">
              <BadgeCheck size={15} />
              <span>
                This title is no longer listed for new viewers.{' '}
                <b>You already paid — it stays in your library.</b>
              </span>
            </div>
          )}

          {boughtDuringPremiere && (
            <div className="watch-assure">
              <BadgeCheck size={15} />
              <span>
                {v.accessType === 'free_with_ads' ? (
                  <>
                    You paid during the premiere — this is Free + Ads for everyone else, but{' '}
                    <b>your copy stays ad-free</b>.
                  </>
                ) : (
                  <>
                    Purchased during the premiere — <b>your access stays ad-free</b>, including after
                    this becomes Free + Ads for everyone else.
                  </>
                )}
              </span>
            </div>
          )}

          {!boughtDuringPremiere && wasPremiere && (
            <div className="watch-assure">
              <BadgeCheck size={15} />
              <span>
                This was a Paid Premiere. The window has ended — it is now <b>Free + Ads</b>. Anyone
                can watch, the creator earns from advertising, and everyone who paid during the
                premiere keeps it ad-free.
              </span>
            </div>
          )}

          <div className="watch-terms">
            <b>{ACCESS_LABEL[v.accessType]}</b>{' '}
            {boughtDuringPremiere && v.accessType === 'free_with_ads'
              ? '— you already paid. New viewers see ads; you do not.'
              : v.accessType === 'paid_premiere'
                ? premiereDays != null
                  ? `— pay ${tzs(v.priceTzs)} to watch now. After ${premiereDays} more day${premiereDays === 1 ? '' : 's'} this becomes Free + Ads, and anyone who paid keeps it in their library.`
                  : `— pay ${tzs(v.priceTzs)} to watch now. When your paid period ends it becomes Free + Ads, and anyone who paid keeps it in their library.`
                : v.accessType === 'free_with_ads'
                  ? '— free to watch. The creator earns from the advertising shown before it.'
                  : `— pay ${tzs(v.priceTzs)} once and it stays in your library, on any device you log into.`}
          </div>

          <MoreLikeThis videoId={v.slug || v.id} />
        </div>
      </div>

      <ShareSheet open={sharing} video={v} share={share} onClose={() => setSharing(false)} />

      <ReportDialog
        open={reporting}
        video={v}
        signedIn={signedIn}
        onClose={() => setReporting(false)}
      />

      <PaymentModal
        open={payOpen}
        video={v}
        onClose={() => setPayOpen(false)}
        onUnlocked={onUnlocked}
      />
    </Shell>
  )
}

function Shell({ children }) {
  return (
    <div className="page">
      <Header solid />
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
