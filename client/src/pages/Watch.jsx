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
import FollowButton from '@/components/ui/FollowButton'
import SaveButton from '@/components/ui/SaveButton'
import { ErrorState } from '@/components/ui/States'
import useApi, { tzs, compact, duration, shortDate, daysUntil, ACCESS_LABEL } from '@/hooks/useApi'
import api, { API_BASE, getAccessToken, mediaUrl } from '@/lib/api'
import { resumePoint } from '@/lib/resumePoint'
import { useToast } from '@/context/ToastContext'
import { authUrl } from '@/lib/nextPath'
import useGoBack from '@/hooks/useGoBack'
import { rememberProgress, recallProgress } from '@/lib/watchProgress'
import { beaconProgress } from '@/lib/progressBeacon'
import { warmShareFromMeta, healShareCard } from '@/lib/warmShare'
import { videoRouteMatches, playbackRouteMatches } from '@/lib/watchUrl'
import { videoShape } from '@/lib/videoShape'
import { takeWarmedVideo, takeWarmedPlayback, takeWarmedAds, dropWarmedWatch } from '@/lib/prefetchWatch'
import { watchLockState } from '@/lib/watchLock'
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
/**
 * When each reassurance appears, in milliseconds from arriving on the page.
 *
 * The last one carries a retry. It has to fire at or before the playback
 * request's own timeout, or the request errors first and the viewer is handed a
 * failure screen without ever having been offered the cheaper option of waiting
 * a little longer.
 */
const BOOT_STAGE_MS = [1500, 5000, 12000]

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
  /** Stays true once the free clip has run out — `previewOver` is cleared on pay. */
  const previewRanOut = useRef(false)
  const [resumeHint, setResumeHint] = useState(0)
  /** An explicit move of the running player — never a rebuild. See StreamPlayer. */
  const [seekTo, setSeekTo] = useState(null)
  /** The player's own live second, for the moment the page has to ask. */
  const livePosition = useRef(0)
  /**
   * The second the CURRENT player was told to start at, decided once.
   *
   * Declared up here, with the other refs, because the value is worked out
   * further down — past the loading shells, where a hook may not be called.
   * Keyed on the video and the playback kind, which is the same key the player
   * itself is mounted under, so the two can never disagree about which film
   * they are describing.
   */
  const startFrom = useRef({ key: null, value: 0 })
  /**
   * Which video this tab just bought — never a bare true/false.
   *
   * React reuses this page when the watcher opens another title. A boolean
   * `justPaid` from video A stayed true on B, C and D, so the paywall never
   * appeared even though the server only ever signed A's full film. The id
   * is the purchase; anything else stays locked.
   */
  const [justPaidFor, setJustPaidFor] = useState(null)
  /* Full video has actually started after purchase — overlay can drop. */
  const [continueReady, setContinueReady] = useState(false)
  /** Pixel size from the player when the row has none yet. */
  const [measured, setMeasured] = useState(null)

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
  const playback = useApi(
    () => takeWarmedPlayback(videoId) || api.playback(videoId),
    [videoId],
    { timeoutMs: 12_000 }
  )
  const adBreaks = useApi(
    () => takeWarmedAds(videoId) || api.ads.breaks(videoId),
    [videoId]
  )
  const [previewAttempt, setPreviewAttempt] = useState(0)

  /**
   * Say something while the player is still coming.
   *
   * ~3.5 s of the wait is Cloudflare's own floor (PLAYER-MEASURE.md), so a
   * silent poster for that long is the normal case, not the exception — and on
   * a slow connection it ran to twenty seconds with nothing on screen but a
   * still frame. These stages do not make anything faster; they stop it looking
   * broken while it is being slow, which is the part the client actually saw.
   *
   * Elapsed time rather than request state, because what matters is how long the
   * viewer has been staring at it, not which promise is outstanding.
   */
  const [bootStage, setBootStage] = useState(0)
  useEffect(() => {
    setBootStage(0)
    const timers = BOOT_STAGE_MS.map((ms, i) => setTimeout(() => setBootStage(i + 1), ms))
    return () => timers.forEach(clearTimeout)
  }, [videoId, previewAttempt])

  /* Drop the top progress bar once this page has painted a shell. */
  useEffect(() => {
    stopProgress()
  }, [stopProgress, videoId])

  const v = video.data?.video
  const share = shareLive ?? video.data?.share
  const playbackRow = playback.data
  const p = playbackRouteMatches(playbackRow, v) ? playbackRow : null
  /**
   * `!playback.error` used to be part of this, and it is why the retry could
   * never appear: the 20 s timeout set the error, this went false, the shell
   * unmounted, and the viewer was thrown straight to a failure screen. The shell
   * now survives the timeout and offers the retry itself; a genuine failure is
   * still reported inside it rather than in place of it.
   */
  const waitingForPlayback =
    playback.loading || Boolean(playback.error) || (Boolean(v?.id) && Boolean(playbackRow) && !p)
  /**
   * Only decide lock state after playback access is known for THIS video.
   *
   * While the request is in flight we used to treat every video as locked, which
   * flashed the paywall for a beat on videos the viewer already owns. Wait for
   * the server answer — then show lock UI only when payment is actually required.
   *
   * A leftover payload from the previous title is not an answer. Access is
   * `user_id + video_id + successful purchase` and nothing else.
   */
  const { accessReady, locked, justPaid, owned, needsPayment } = watchLockState({
    playback: p,
    loading: playback.loading,
    justPaidFor,
    videoId,
    video: v,
  })
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
   * Self-heal a missing WhatsApp/Facebook poster. Nothing else, and not yet.
   *
   * This used to call `warmShareFromMeta` here as well, on mount — which fetches
   * two `/watch/:slug` URLs and prefetches the 1200×630 share card. Those two
   * URLs are served by a serverless function that renders the whole SPA shell,
   * and the card is a JPEG of 80–250 KB that this viewer will never look at. All
   * three went out in the same tick the Cloudflare player was fetching its
   * manifest and first segment, and took bandwidth from it on every single view.
   *
   * Nobody needed it here. The cards are built at publish time; this only ever
   * warmed a cache. The warm that matters still happens on intent —
   * `primeShare` runs on the Share button's pointerenter, touchstart and focus,
   * which is well before the sheet can open — and `healShareCard` warms from the
   * meta it fetches anyway.
   */
  useEffect(() => {
    if (!share?.watchUrl || !v?.slug) return
    if (!share.cardStatus || share.cardStatus === 'ready') return
    healShareCard(v.slug, (meta) => setShareLive((prev) => ({ ...prev, ...meta })))
  }, [share?.watchUrl, share?.cardStatus, v?.slug])

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
    setJustPaidFor(null)
    setContinueReady(false)
    setResumeHint(0)
    setMeasured(null)
    lastReported.current = 0
    watchedTo.current = 0
    previewRanOut.current = false
    /* A start point belongs to one video. Carrying it over would open the next
       title part-way through, at a second nobody watching it has reached. */
    startFrom.current = { key: null, value: 0 }
    livePosition.current = 0
    paywallAt.current = 0
    setSeekTo(null)
    setActiveAd(null)
    playedBreaks.current = new Set()
    mainProgress.current = 0
    setPreviewAttempt(0)
  }, [videoId])

  /**
   * Clip generation is not done on Play. If this title is missing a preview
   * asset, ask again a few times while Cloudflare cuts it in the background.
   */
  useEffect(() => {
    if (!p?.previewPending || p?.unavailable || p?.playback?.iframe) return
    if (previewAttempt >= 5) return
    const t = setTimeout(() => {
      playback.reload({ quiet: true })
      setPreviewAttempt((n) => n + 1)
    }, 3000)
    return () => clearTimeout(t)
  }, [p?.previewPending, p?.playback?.iframe, previewAttempt, playback.reload])

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
   * The furthest second we can prove this viewer reached, taken on demand.
   *
   * Called at the paywall and again the instant checkout opens, because those
   * are the two moments the number is about to be needed and the last moment it
   * is still knowable. The player's own clock leads the page's copy — a halted
   * preview stops reporting, and the payment sheet then sits on screen through
   * a whole mobile-money round trip — so asking late is asking a page that has
   * already stopped being told.
   */
  const paywallAt = useRef(0)
  const capturePosition = useCallback(() => {
    const live = Math.floor(Number(livePosition.current) || 0)
    const best = Math.max(live, watchedTo.current, recallProgress(videoId))
    if (best > watchedTo.current) watchedTo.current = best
    if (best > paywallAt.current) paywallAt.current = best
    if (best > 0) rememberProgress(videoId, best, { force: true })
    return paywallAt.current
  }, [videoId])

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
    /**
     * Write it to the account, and then leave the page alone.
     *
     * This used to reload playback afterwards, to pick up the server's copy of
     * the very number it had just sent. Every reload mints a fresh signed
     * token, so the iframe URL changed, so the player was torn down and rebuilt
     * — seconds of black screen a moment after the video had started, for any
     * signed-in viewer with a position from earlier in the tab. It is a second,
     * independent cause of the freeze, and it costs a round trip to learn
     * nothing: the server's answer is the number we already hold.
     *
     * The local copy is kept rather than forgotten, too. Handing ownership over
     * and then deleting our own copy assumes the server will hand it back, and
     * it does not always — a position close to the end is deliberately returned
     * as zero. Both copies say the same thing and playback overwrites ours
     * every few seconds, so there is nothing here that can go stale.
     */
    api.saveProgress(v.id, local).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, v?.id])

  /**
   * Leaving the page mid-film should still be resumable — and this is the write
   * that used to be lost.
   *
   * `pagehide` fired and called `reportProgress`, which sends an ordinary PUT.
   * A document that is unloading has its in-flight requests CANCELLED, so on a
   * phone that request usually never arrived: the viewer backgrounded the tab,
   * the system reclaimed it, and the position they came back to was whatever the
   * ten-second timer had last managed to save. `navigator.sendBeacon` is the one
   * transport the platform promises to deliver after the page is gone.
   *
   * `visibilitychange` is here as well as `pagehide`, and it is the more
   * important of the two on iOS: a tab that is backgrounded and then killed by
   * the system may never fire `pagehide` at all, but it always goes hidden
   * first. Writing on hidden means the position is already saved before the
   * decision to kill the tab is even taken.
   *
   * The local copy is written on the same beat, for the signed-out viewer who
   * has no account to write to yet.
   */
  useEffect(() => {
    const flush = () => {
      const at = Math.floor(watchedTo.current || 0)
      if (at <= 0) return
      rememberProgress(videoId, at, { force: true })
      if (!signedIn || !v?.id) return
      const sent = beaconProgress({
        apiBase: API_BASE,
        token: getAccessToken(),
        videoId: v.id,
        seconds: at,
      })
      if (!sent) reportProgress(at, { force: true })
    }
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHide)
      flush()
    }
  }, [reportProgress, signedIn, v?.id, videoId])

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
    /**
     * Put the film back where the advert interrupted it — if it moved.
     *
     * It should not have: the film is paused in place under the break, so it
     * resumes at the same second on its own. This used to be written into the
     * resume hint instead, which rebuilt the whole iframe every single time a
     * mid-roll ended — a poster flash and a reload to land on the second it was
     * already sitting on. Once the start second was pinned that write stopped
     * reaching the player at all and became decoration.
     *
     * As a seek it earns its place again, and covers the one case the pause
     * cannot: a refused `pause()` leaving the film running on underneath the
     * advert. The seek is ignored unless the player is genuinely elsewhere.
     */
    if (activeAd?.placement === 'mid_roll' && mainProgress.current > 0) {
      const at = Math.floor(mainProgress.current)
      setSeekTo({ seconds: at, nonce: `mid_roll:${at}` })
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

    const timer = setTimeout(() => {
      previewRanOut.current = true
      setPreviewOver(true)
    }, (stopsAt + 8) * 1000)
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
      captured: capturePosition(),
      watchedTo: watchedTo.current,
      remembered: recallProgress(videoId),
      stopsAt: Number(p?.playback?.stopsAtSeconds || v?.freePreviewSeconds || 0),
      previewEnded: previewOver || previewRanOut.current,
    })
    watchedTo.current = from
    rememberProgress(videoId, from, { force: true })

    /* Prefetch cached the unpaid preview. Reload must not reuse that iframe. */
    dropWarmedWatch(videoId)
    dropWarmedWatch(v?.id)
    dropWarmedWatch(v?.slug)

    setJustPaidFor(v?.id || videoId)
    setContinueReady(false)
    setPayOpen(false)
    setPreviewOver(false)
    setResumeHint(from)

    /**
     * Say why it starts where it starts.
     *
     * `resumePoint` deliberately begins at zero for someone who paid without
     * watching the preview — there is no position to return to. On screen that
     * is indistinguishable from the film having forgotten where they were, and
     * it is the kind of thing a client reports as a bug. One clause removes the
     * ambiguity.
     */
    showToast(
      from > 5
        ? `Unlocked — continuing from ${duration(Math.floor(from))}`
        : "Unlocked — starting from the beginning, you hadn't watched the preview"
    )

    const saveThenReload = async () => {
      if (from > 0 && v?.id) {
        try {
          await api.saveProgress(v.id, Math.floor(from))
        } catch {
          /* local hint still holds this tab */
        }
      }
      dropWarmedWatch(videoId)
      dropWarmedWatch(v?.id)
      dropWarmedWatch(v?.slug)
      playback.reload({ quiet: true })
      video.reload({ quiet: true })
    }
    saveThenReload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback, video, showToast, p?.playback?.stopsAtSeconds, v?.freePreviewSeconds, v?.id, v?.slug, previewOver, videoId])

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
   * Belt and braces on the resume after payment.
   *
   * The full film's iframe URL already carries `startTime`, so in the ordinary
   * case it opens at the right second and this asks for nothing: a seek is only
   * performed when the player turns out to be more than two seconds away from
   * where it should be. That covers the one thing the URL cannot — Stream
   * having already buffered from zero by the time it honours the parameter.
   *
   * A seek, deliberately, and not a different `startAt`: moving the start
   * second would re-navigate the iframe and restart the film, which is the
   * fault all of this exists to stop.
   */
  useEffect(() => {
    if (!justPaid || p?.playback?.kind !== 'full') return
    const at = Math.floor(Number(resumeHint) || 0)
    if (at < 2) return
    setSeekTo({ seconds: at, nonce: `paid:${v?.id || videoId}:${at}` })
  }, [justPaid, p?.playback?.kind, resumeHint, v?.id, videoId])

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
   * Where playback actually begins — worked out ONCE per player, not per render.
   *
   * The server's figure wins: it is the only one that survives a refresh. The
   * local hint fills the gap between paying and the reloaded playback arriving.
   *
   * Why this is pinned rather than derived every time: `recallProgress` reads a
   * position that playback itself keeps advancing, so computing this on each
   * render produced a number that climbed while the film was running. The
   * player took that as "start somewhere else", rebuilt its iframe and
   * restarted the video — a freeze of several seconds, triggered by something
   * as innocent as tapping Share. The start point belongs to the player, so it
   * is decided when the player is created and then left alone.
   *
   * The key is the one the player is mounted under, so a genuinely new player
   * — the full film arriving after payment — does get a fresh answer.
   */
  const playerKey = p?.playback?.iframe ? `${v?.id}-${p.playback.kind}` : null
  if (playerKey && startFrom.current.key !== playerKey) {
    startFrom.current = {
      key: playerKey,
      value: justPaid
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
          ),
    }
  }
  const resumeAt = startFrom.current.value

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
  const shape = videoShape(v.width || measured?.width, v.height || measured?.height)
  /** After preview: cinematic lock on the player — payment sheet only on tap. */
  const showLockGate =
    needsPayment &&
    (previewOver || (accessReady && !p?.playback?.iframe && !p?.previewPending && !p?.unavailable))

  const openCheckout = () => {
    if (!needsPayment) return
    /* Take the position BEFORE anything else happens to the page. */
    const at = capturePosition()
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
      rememberProgress(videoId, at, { force: true })
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
        <div
          className={`player ${showLockGate ? 'is-gated' : ''} is-${shape.orientation}`.trim()}
          style={{
            '--player-aspect': shape.aspect,
            '--player-ratio': String(shape.ratio),
          }}
        >
          {/* Somebody who opened this on a shared link has nothing of ours
              behind them, and a bare navigate(-1) would take them off the site
              — back to WhatsApp, usually. Explore is the useful destination
              there. */}
          <button className="pl-back" onClick={goBack} aria-label="Go back">
            <ArrowLeft />
          </button>

          {waitingForPlayback && !p?.playback?.iframe ? (
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

              {/* Stage 0 is the poster on its own — most plays never leave it. */}
              {bootStage >= 1 && (
                <div className="stream-boot" role="status" aria-live="polite">
                  <p className="stream-boot-msg">
                    {bootStage >= 3
                      ? 'Still not starting'
                      : bootStage >= 2
                        ? 'Slow connection — still connecting'
                        : 'Connecting…'}
                  </p>
                  {bootStage >= 3 && (
                    <>
                      <p className="stream-boot-sub">
                        {playback.error && playback.error !== 'Something went wrong'
                          ? playback.error
                          : 'Nothing has been charged.'}
                      </p>
                      <button
                        className="btn btn-ghost btn-sm"
                        type="button"
                        onClick={() => {
                          setBootStage(0)
                          setPreviewAttempt((n) => n + 1)
                          playback.reload()
                        }}
                      >
                        Try again
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ) : p?.unavailable && !p?.playback?.iframe ? (
            <div className="player-empty">
              <AlertTriangle />
              <b>This video is unavailable</b>
              <p>The file is not ready to play. Try another title.</p>
            </div>
          ) : p?.previewPending && !p?.playback?.iframe ? (
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
              <p className="stream-boot-msg">Preview is being prepared</p>
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
          ) : p?.playback?.iframe ? (
            <>
              <StreamPlayer
                key={`${v.id}-${p.playback.kind}`}
                src={p.playback.iframe}
                title={v.title}
                /* The server's stored position is the authority; the local hint
                   only covers the moment straight after payment, before the
                   reloaded playback has come back. */
                startAt={resumeAt}
                seekRequest={seekTo}
                positionRef={livePosition}
                autoplay={!activeAd}
                playOnReady={!activeAd}
                paused={Boolean(activeAd)}
                onMediaSize={
                  v.width && v.height
                    ? undefined
                    : (size) => setMeasured((was) => was || size)
                }
                /**
                 * Where the free preview ends, enforced by the player itself.
                 *
                 * The page used to do this by showing the paywall over the
                 * top when the clock passed the number — which never stopped
                 * the film. The preview is its own Cloudflare clip, cut when
                 * previews were five minutes long, so a video stating 3:37
                 * kept playing underneath the paywall until 5:00.
                 */
                stopAt={p.playback.kind === 'preview' ? previewSeconds : 0}
                onStopReached={() => {
                  capturePosition()
                  watchedTo.current = Math.max(watchedTo.current, previewSeconds)
                  rememberProgress(videoId, watchedTo.current, { force: true })
                  previewRanOut.current = true
                  setPreviewOver(true)
                  reportProgress(previewSeconds, { force: true })
                }}
                onPlaying={() => {
                  /* Preview clip firing play must not drop the "Unlocked" veil
                     or the full film never remounts at the resume second. */
                  if (justPaid && p.playback.kind !== 'full') return
                  if (activeAd) return
                  setContinueReady(true)
                }}
                onRetry={() => playback.reload()}
                onEnded={() => {
                  if (needsPayment) {
                    watchedTo.current = Math.max(watchedTo.current, previewSeconds)
                    rememberProgress(videoId, watchedTo.current, { force: true })
                    previewRanOut.current = true
                    setPreviewOver(true)
                    reportProgress(previewSeconds, { force: true })
                    return
                  }
                  runBreak('post_roll')
                }}
                /* Pausing and seeking are deliberate: the position they leave
                   behind is the one the viewer expects to return to, and waiting
                   for the ten-second timer after either loses up to ten seconds
                   of it. Pause matters most — on a phone it is usually the last
                   thing that happens before the tab goes away. */
                onPaused={(at) => {
                  if (activeAd) return
                  watchedTo.current = Math.max(watchedTo.current, at || 0)
                  reportProgress(watchedTo.current, { force: true })
                }}
                onSeeked={(at) => {
                  if (activeAd) return
                  /* A seek BACKWARDS is the viewer saying "I want to be here",
                     so this one number replaces the high-water mark rather than
                     being max()'d with it — otherwise rewinding and closing the
                     tab returns them to the furthest point they ever reached,
                     which is exactly what they just chose to leave. */
                  watchedTo.current = at || 0
                  reportProgress(watchedTo.current, { force: true })
                }}
                onTimeUpdate={(current) => {
                  if (activeAd) return
                  const prev = watchedTo.current
                  if (current < 2 && prev > 8) {
                    /* Preview clip reset to 0 after ending — keep the stop. */
                  } else {
                    watchedTo.current = Math.max(prev, current || 0)
                  }
                  reportProgress(watchedTo.current)

                  if (needsPayment && previewSeconds && current >= previewSeconds - 0.4) {
                    watchedTo.current = Math.max(watchedTo.current, previewSeconds)
                    previewRanOut.current = true
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
              {activeAd && (
                <div className="player-ad-layer">
                  <AdBreak ad={activeAd} videoId={v.id} playId={playId} onFinished={adFinished} />
                </div>
              )}
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
              <small>
                {resumeAt > 2
                  ? `Resuming from ${duration(Math.floor(resumeAt))}`
                  : 'Continuing from where the preview stopped…'}
              </small>
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
              {/* Next to Share, because they are the same kind of decision:
                  "keep this" and "send this". */}
              <SaveButton videoId={v.id} className="btn-sm" />
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

          {/**
            * The creator row, and the one place almost all traffic can follow from.
            *
            * Follow existed only on the creator's own page, which nothing links
            * to from here — every share link and every Explore tap lands on this
            * page, so the feature was effectively invisible. It is a real button
            * now, next to the Profile pill.
            *
            * The row stopped being one big anchor to make room for it: a button
            * inside an anchor is invalid and browsers resolve it by closing the
            * anchor early. Same pattern as the cards — the name carries the only
            * link and `.creator-open::after` stretches it across the row, so
            * tapping the row still opens the profile on the first tap.
            */}
          {v.creator && (
            <div className="creator-row">
              {v.creator.avatarUrl ? (
                <img src={mediaUrl(v.creator.avatarUrl)} alt="" />
              ) : (
                <span className="creator-initials">{initials(v.creator.name)}</span>
              )}
              <div>
                <b>
                  <Link
                    className="creator-open"
                    to={v.creator.id ? `/creator/${v.creator.id}` : '/explore'}
                  >
                    {v.creator.name}
                  </Link>
                  {v.creator.verified && (
                    <BadgeCheck className="verified-tick" aria-label="Verified creator" />
                  )}
                </b>
                <small>View creator profile</small>
              </div>
              <div className="creator-row-actions">
                <FollowButton creatorId={v.creator.id} followers={v.creator.followers} />
                <Link
                  className="btn btn-ghost btn-sm creator-profile-link"
                  to={v.creator.id ? `/creator/${v.creator.id}` : '/explore'}
                >
                  Profile
                </Link>
              </div>
            </div>
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
