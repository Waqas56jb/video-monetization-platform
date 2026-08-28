import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, RefreshCw, Volume2 } from 'lucide-react'
import { AD_AIRTIME_FLOOR } from '@/lib/adSkip'
import { ensureStreamSdk } from '@/lib/prefetchWatch'
import { markPerf, measurePerf } from '@/lib/perfLog'

/**
 * Cloudflare Stream iframe player.
 *
 * There is no loading state here, deliberately. This used to paint our own
 * poster over the iframe and hold it there behind a connecting message until the SDK relayed an event — so the viewer was shown a still
 * image for as long as it took us to notice a player that had, in most cases,
 * been ready and painting its own poster the whole time. Every failure mode of
 * that cover was a video that looked broken while it worked: a blocked SDK
 * script left it up for ever, and a twelve second timer replaced it with an
 * error over a film that was already playing underneath.
 *
 * So the iframe is mounted the moment there is a source and nothing of ours is
 * ever drawn on top of it. Cloudflare's player has a poster, a spinner and a
 * play button of its own; they are better than ours because they know what the
 * player is actually doing. The only thing we still say is that it failed.
 */

function buildSrc(src, startAt, controls) {
  try {
    const url = new URL(src)
    // Always ask for muted autoplay. A paused Stream iframe with no parent
    // tap target is the giant Play button the client cannot start — especially
    // with controls=false, where that button lives in a cross-origin frame.
    url.searchParams.set('autoplay', 'true')
    url.searchParams.set('muted', 'true')
    // Do not put a signed poster on this URL. It doubled the JWT, aborted the
    // embed (net::ERR_ABORTED), and left the same dead Play overlay.
    if (startAt > 0) url.searchParams.set('startTime', `${Math.floor(startAt)}s`)
    if (controls === false) url.searchParams.set('controls', 'false')
    url.searchParams.set('preload', 'auto')
    url.searchParams.set('letterboxColor', '000000')
    return url.toString()
  } catch {
    return null
  }
}

export default function StreamPlayer({
  src,
  autoplay = false,
  onEnded,
  onTimeUpdate,
  /**
   * Second to begin at.
   *
   * After a purchase the viewer should carry on from where the free preview
   * stopped, not start the film again. Two mechanisms, because either alone has
   * let us down: `startTime` in the URL decides where the first frame comes
   * from, and the SDK seek below covers the case where Stream has already
   * buffered from zero by the time it honours the parameter.
   */
  startAt = 0,
  /**
   * The second the free preview ends.
   *
   * This has to be enforced here, where the player is, and not by the page
   * putting a paywall over the top of it. The preview is its own Cloudflare
   * clip, and those clips were cut when the preview was five minutes long —
   * so a video that now states 3:37 still has a 5:00 file behind it. The page
   * showed the paywall at 3:37 and the film carried on playing underneath for
   * another minute and a half, which is what the client heard.
   *
   * Whatever the clip's own length turns out to be, playback stops on this
   * number.
   */
  stopAt = 0,
  /**
   * Try to start playing without a further tap.
   *
   * Used after a purchase, where the viewer's click on Pay is recent enough that
   * most browsers still count it as a gesture. If one refuses, playback simply
   * waits at the right second for them to press play — never silently at 0:00.
   */
  playOnReady = false,
  controls = true,
  title = 'Video player',
  onRetry,
  onPlaying,
  onReady,
  /**
   * Pixel size of the file, when the API did not already know it.
   * Watch uses this so a portrait film is not stuck in a 16:9 box.
   */
  onMediaSize,
  /**
   * Do not treat the player as started until media time is actually advancing.
   *
   * Ads use this so a black buffer, an iframe load, or Stream's `play` event
   * cannot start the skip clock. The film itself still uncovers on the usual
   * ready events.
   */
  requireAirtime = false,
  /** Fired once when `stopAt` is reached, after playback has been paused. */
  onStopReached,
  /**
   * Keep the iframe in the document but do not play — used while a pre-roll
   * sits on top so the film is already buffered when the advert ends.
   */
  paused = false,
  /**
   * Move the live player, without rebuilding it: `{ seconds, nonce }`.
   *
   * `startAt` decides where the iframe's FIRST frame comes from, and it is
   * pinned for the life of a source — see `pin` below for why changing it is
   * never allowed. A caller that genuinely needs the player moved after it is
   * running bumps the nonce instead, and the SDK seeks in place: no new
   * iframe, no new token, no reload.
   */
  seekRequest = null,
  /**
   * A ref this player keeps the live second in, for the page to read.
   *
   * `onTimeUpdate` tells the page where playback got to, but only while it is
   * being told — and the halt at the end of a free preview deliberately stops
   * telling it. So at the exact moment that matters most, the page's own idea
   * of the position is already behind the player's. This is the player's
   * answer, readable synchronously, at the instant somebody taps Unlock.
   */
  positionRef = null,
}) {
  /**
   * Playing, but silent.
   *
   * Muted autoplay is the only kind a browser always permits, so after a
   * purchase the film starts that way and sound is requested a moment later.
   * When that request is refused there is nothing to be done from script — but
   * the viewer is watching a film with no sound and deserves to be told, in a
   * way that is one tap and is not a play button, because it is already
   * playing.
   */
  const [silent, setSilent] = useState(false)
  const playerRef = useRef(null)
  const frame = useRef(null)
  const onPlayingRef = useRef(onPlaying)
  onPlayingRef.current = onPlaying
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  const onMediaSizeRef = useRef(onMediaSize)
  onMediaSizeRef.current = onMediaSize
  const onTimeUpdateRef = useRef(onTimeUpdate)
  onTimeUpdateRef.current = onTimeUpdate
  const onEndedRef = useRef(onEnded)
  onEndedRef.current = onEnded
  /* Read through refs: the listener is attached once per source, and must not
     be torn down and rebuilt every time the page re-renders. */
  const stopAtRef = useRef(0)
  stopAtRef.current = Math.max(0, Number(stopAt) || 0)
  const onStopReachedRef = useRef(null)
  onStopReachedRef.current = onStopReached
  /**
   * The player failed outright — not "is still loading".
   *
   * There is no loading state here any more. Cloudflare's own player paints its
   * poster and its controls the moment the iframe exists, so anything of ours
   * on top of it is a worse version of what is already there, shown for longer.
   * The only thing worth saying is that it broke.
   */
  const [failed, setFailed] = useState(false)
  const requireAirtimeRef = useRef(requireAirtime)
  requireAirtimeRef.current = requireAirtime
  const playOnReadyRef = useRef(playOnReady)
  playOnReadyRef.current = playOnReady
  const autoplayRef = useRef(autoplay)
  autoplayRef.current = autoplay
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  /** Bumping this remounts the iframe so a stalled Stream load can be retried. */
  const [boot, setBoot] = useState(0)
  /**
   * Pin startTime to the moment this source first loads — and never move it.
   *
   * `iframeSrc` is the iframe's `src` attribute. Changing that attribute
   * re-navigates a live cross-origin frame: Stream tears down, the SDK
   * wrapper below is rebuilt, the poster comes back over the top and the film
   * restarts. It costs seconds every time.
   *
   * This used to re-pin whenever `startAt` grew by more than 0.4s, and
   * `startAt` grows on its own — the page derives it from the position saved
   * every ten seconds of playback. So any re-render during playback (tapping
   * Share, an advert ending, the top progress bar, a toast) pushed a larger
   * number in here and reloaded the film underneath the viewer. That is the
   * freeze, the mid-play restart and the "unresponsive" report, and it is why
   * the rule is now absolute: one source, one URL, for its whole life.
   *
   * Moving a player that is already running is a different operation with its
   * own door — `seekRequest`, applied through the SDK, below.
   */
  const pin = useRef({ src: null, startAt: 0 })
  if (src !== pin.current.src) {
    pin.current = { src, startAt: Math.max(0, Number(startAt) || 0) }
  }
  const resumeAt = pin.current.startAt
  const iframeSrc = useMemo(
    () => (src ? buildSrc(src, resumeAt, controls) : null),
    [src, resumeAt, controls]
  )

  /**
   * An explicit, caller-requested seek on the running player.
   *
   * Held until the player exists and is seekable, because the request can
   * arrive before the SDK has booted. Applied at most once per nonce, and only
   * when the player is genuinely somewhere else — so it can never fight a
   * viewer who has just scrubbed.
   */
  const srcRef = useRef(null)
  srcRef.current = src
  /* Read through a ref: the SDK listener is attached once per source and must
     not be rebuilt because the page re-rendered. */
  const positionRefProp = positionRef
  const pendingSeek = useRef({ nonce: null, seconds: 0, done: true, tries: 0, src: null })
  const applySeek = (player) => {
    const want = pendingSeek.current
    if (!player || want.done || want.nonce == null) return
    /* A seek is a second inside one particular film. If the source has moved
       on, this one no longer means anything — retiring it is the only safe
       thing to do with it. */
    if (want.src !== srcRef.current) {
      want.done = true
      return
    }
    /* Writing currentTime on a cross-origin player can be silently dropped, so
       "applied" is not something we can assert — only observe. Keep asking
       until the player agrees it is there, then stop. */
    const at = Number(player.currentTime) || 0
    if (Math.abs(at - want.seconds) <= 2) {
      want.done = true
      return
    }
    if (want.tries >= 5) {
      want.done = true
      return
    }
    want.tries += 1
    try {
      player.currentTime = want.seconds
    } catch {
      /* not seekable yet — the next player event tries again */
    }
  }
  const seekNonce = seekRequest?.nonce ?? null
  const seekSeconds = Math.max(0, Number(seekRequest?.seconds) || 0)
  useEffect(() => {
    if (seekNonce == null || seekNonce === pendingSeek.current.nonce) return
    pendingSeek.current = {
      nonce: seekNonce,
      seconds: seekSeconds,
      done: false,
      tries: 0,
      src: srcRef.current,
    }
    applySeek(playerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs only
  }, [seekNonce, seekSeconds])

  const retry = () => {
    if (onRetry && (!src || !iframeSrc)) {
      onRetry()
      return
    }
    setFailed(false)
    setBoot((n) => n + 1)
  }

  useEffect(() => {
    setFailed(false)
    if (!iframeSrc) return
    /* Autoplay means most viewers never tap anything, so a tap is not a
       boundary we can measure from. This one always happens. */
    markPerf('playerBoot')
  }, [iframeSrc, boot])

  useEffect(() => {
    if (!iframeSrc) return
    let player = null
    let alive = true
    let kickTimer = null
    let watchdog = null
    let stopPoll = null

    ensureStreamSdk().then((Stream) => {
      if (!alive || !frame.current) return
      /**
       * No SDK — but the iframe is playing anyway.
       *
       * Everything that lifts the poster lives inside this callback, and the
       * poster sits opaque on top of the frame. So an ad blocker, a DNS filter
       * or one dropped request for the embed script left every video on the
       * site as a still image with a connecting message, then a twelve
       * second timeout, then a Try again that did the same thing — while the
       * film played behind it, audible if the viewer had sound on.
       *
       * The iframe carries its own controls and needs nothing from us. Uncover
       * it and let Cloudflare's player be the player.
       */
      if (!Stream) {
        onReadyRef.current?.()
        return
      }
      try {
        player = Stream(frame.current)
        playerRef.current = player
        if (pausedRef.current) {
          try {
            player.pause?.()
          } catch {
            /* held under a pre-roll */
          }
        }
        player.addEventListener('ended', () => onEndedRef.current?.())
        let stopped = false
        const haltIfDue = () => {
          if (!alive || !player) return
          const limit = stopAtRef.current
          const at = Number(player.currentTime) || 0
          /* Publish the live second before any of the branches below, because
             the one that halts a finished preview deliberately stops reporting
             — and that is the exact moment the page needs the number. */
          if (positionRefProp && at > 0) positionRefProp.current = at
          if (!(limit > 0) || at < limit - 0.15) {
            if (limit > 0 && at < limit - 0.15) stopped = false
            if (!(limit > 0 && at >= limit - 0.15)) onTimeUpdateRef.current?.(at, player.duration)
            return
          }
          try {
            player.pause?.()
            player.currentTime = limit
          } catch {
            /* paywall still covers it */
          }
          /**
           * Say it once.
           *
           * This report used to sit outside the guard, and the poll below runs
           * every 200ms whether or not anything has changed — so a viewer
           * sitting on the paywall, or with the payment sheet open, produced
           * five of these a second for as long as they stayed there. The page
           * answers each one with a forced progress report: a synchronous
           * sessionStorage write and a PUT to the API. Five writes and five
           * requests a second, indefinitely, against an API that allows a
           * hundred and twenty a minute — so it also rate-limited the very
           * payment the viewer was in the middle of making.
           *
           * The preview halting is one event. It is reported like one.
           */
          if (!stopped) {
            stopped = true
            onStopReachedRef.current?.()
            onTimeUpdateRef.current?.(limit, player.duration)
          }
        }
        player.addEventListener('timeupdate', haltIfDue)
        stopPoll = setInterval(haltIfDue, 200)
        let aired = false
        const shown = () => {
          if (aired) return
          aired = true
          measurePerf('playerBoot', 'boot-to-first-frame')
          onPlayingRef.current?.()
          if (watchdog) {
            clearInterval(watchdog)
            watchdog = null
          }
        }
        const noteIfAiring = (t = Number(player.currentTime) || 0) => {
          const floor = requireAirtimeRef.current ? AD_AIRTIME_FLOOR : 0.1
          if (t < floor) return
          const first = !aired
          shown()
          if (!first || !alive) return
          /**
           * It is playing. Say whether it has sound — do not try to give it any.
           *
           * This used to set `player.muted = false` the instant the first frame
           * aired. Muted autoplay is the only kind a browser grants without a
           * gesture, so unmuting one immediately is asking for the permission
           * that was never given: the browser answers by pausing the video. The
           * viewer saw the film start and stop.
           *
           * Nothing recovered it either. The `pause` handler that was meant to
           * re-mute and restart guarded on `!aired`, and `aired` is already true
           * by the time anything unmutes — so the branch could never run. What
           * looked like a recovery path was unreachable, which is why this reads
           * as "the preview does not play".
           *
           * So the rule is now the browser's own: it stays muted until a person
           * asks for sound. The pill below is that ask, and it appears the
           * moment the film is airing rather than a second and a half later.
           */
          if (requireAirtimeRef.current) return
          try {
            setSilent(Boolean(player.muted))
          } catch {
            /* the player's own control is still there */
          }
        }
        /**
         * Stream has media. Tell the page — there is nothing to uncover.
         *
         * This used to lift our poster off the iframe. Nothing of ours sits on
         * top of the player any more, so all that is left is the announcement
         * that anything depending on the player being usable was waiting for.
         */
        const announceReady = () => {
          onReadyRef.current?.()
          if (requireAirtimeRef.current) return
          onPlayingRef.current?.()
        }
        player.addEventListener('loadedmetadata', announceReady)
        player.addEventListener('loadeddata', announceReady)
        player.addEventListener('canplay', announceReady)
        /* The one thing still worth saying on screen. */
        player.addEventListener('error', () => {
          if (alive) setFailed(true)
        })
        player.addEventListener('playing', () => noteIfAiring())
        player.addEventListener('timeupdate', () => noteIfAiring())
        const reportSize = () => {
          if (!onMediaSizeRef.current) return
          const w = Number(player.videoWidth || 0)
          const h = Number(player.videoHeight || 0)
          if (w > 0 && h > 0) onMediaSizeRef.current({ width: w, height: h })
        }
        player.addEventListener('loadedmetadata', reportSize)
        player.addEventListener('loadeddata', reportSize)

        /* Sound can also be turned on from Stream's own controls. Follow it, so
           the pill is never offering something the viewer already has. */
        player.addEventListener('volumechange', () => {
          if (!alive || requireAirtimeRef.current) return
          try {
            setSilent(Boolean(player.muted))
          } catch {
            /* ignore */
          }
        })

        // Seek once, and only if the URL parameter did not already land us
        // there. Seeking again on every metadata event would fight the viewer
        // every time they tried to scrub backwards.
        if (resumeAt > 0) {
          let seeked = false
          const seek = () => {
            if (seeked) return
            if (player.currentTime >= resumeAt - 1.5) {
              seeked = true // Stream honoured startTime; leave it alone.
              return
            }
            try {
              player.currentTime = resumeAt
              seeked = true
            } catch {
              /* not seekable yet — the next event will try again */
            }
          }
          player.addEventListener('loadedmetadata', seek)
          player.addEventListener('canplay', seek)
        }

        /* A seek asked for before this player existed, or while it was still
           loading, lands here rather than being dropped. */
        const runPendingSeek = () => applySeek(player)
        runPendingSeek()
        player.addEventListener('loadedmetadata', runPendingSeek)
        player.addEventListener('canplay', runPendingSeek)
        player.addEventListener('playing', runPendingSeek)

        {
          /**
           * Kick muted playback from THIS page, every time.
           *
           * Stream's own Play button lives inside a cross-origin iframe.
           * Tapping it is not a gesture our page can use, and on Safari it
           * often does nothing. play() from the parent, muted, is the one
           * start that browsers allow without a tap — and the overlay below
           * is the tap when they refuse even that.
           */
          let lastTime = -1
          let lastProgressAt = Date.now()
          let attempts = 0

          const play = async (mute) => {
            try {
              if (mute && 'muted' in player) player.muted = true
              await Promise.resolve(player.play?.())
              return true
            } catch {
              return false
            }
          }

          const start = async () => {
            if (!alive || aired || pausedRef.current) return
            /* Refused. Cloudflare's own play button is already sitting there
               in the middle of the frame — the viewer taps that. We do not put
               a second one over the top of it. */
            if (!(await play(true))) return
            noteIfAiring()
          }

          const onTime = () => {
            const t = Number(player.currentTime) || 0
            if (t > lastTime + 0.15) {
              lastTime = t
              lastProgressAt = Date.now()
            }
          }

          player.addEventListener('canplay', start)
          player.addEventListener('loadeddata', start)
          player.addEventListener('loadedmetadata', start)
          player.addEventListener('timeupdate', onTime)
          kickTimer = setTimeout(start, 0)

          watchdog = setInterval(() => {
            if (!alive || aired || pausedRef.current) {
              if (aired && watchdog) {
                clearInterval(watchdog)
                watchdog = null
              }
              return
            }
            if (Date.now() - lastProgressAt < 2000) return
            if (attempts >= 8) {
              clearInterval(watchdog)
              watchdog = null
              return
            }
            attempts += 1
            lastProgressAt = Date.now()
            play(true)
          }, 900)
        }
      } catch {
        /* iframe still plays */
      }
    })

    return () => {
      alive = false
      /* Retire the shared handle too, not just the local one. Anything holding
         playerRef — a seek, a tap, the page reading the position — would
         otherwise be talking to a wrapper around an iframe that has gone. */
      if (playerRef.current === player) playerRef.current = null
      player = null
      if (kickTimer) clearTimeout(kickTimer)
      if (watchdog) clearInterval(watchdog)
      if (stopPoll) clearInterval(stopPoll)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iframeSrc, boot])

  /**
   * Holding the film under an advert, and starting it again afterwards.
   *
   * The comment here used to say the overlay and the watchdog still covered a
   * refused play. They do not, and that mattered: both retire the moment the
   * film has aired — `shown()` clears the watchdog, and `start()` returns early
   * once `aired` — so by the time a mid-roll ends this is the ONLY thing left
   * that restarts the film. `play()` returns a promise, so a browser refusing
   * an un-gestured resume rejects it asynchronously and a synchronous
   * `try/catch` never sees it. The advert would finish and the film would sit
   * frozen with nothing on the page able to start it.
   *
   * So the resume is awaited, retried muted — the one kind a browser always
   * allows — and if even that is refused the tap comes back. The viewer is
   * never left holding a dead player.
   */
  useEffect(() => {
    const player = playerRef.current
    if (!player) return

    if (paused) {
      try {
        player.pause?.()
      } catch {
        /* held under the advert by the layer above */
      }
      return
    }
    if (!playOnReady && !autoplay) return

    let alive = true
    const attempt = async () => {
      try {
        await Promise.resolve(player.play?.())
        return true
      } catch {
        return false
      }
    }

    ;(async () => {
      if (await attempt()) return
      if (!alive) return
      try {
        if ('muted' in player) player.muted = true
      } catch {
        /* ignore */
      }
      if (await attempt()) {
        if (alive) setSilent(true)
        return
      }
      /* Nothing script is allowed to do — and nothing needs to be. The film
         is paused on a frame with Cloudflare's own controls over it. */
    })()

    return () => {
      alive = false
    }
  }, [paused, playOnReady, autoplay])

  if (!src) {
    return (
      <div className="stream-fallback" role="status">
        <AlertTriangle size={22} />
        <p>Playback is not available for this video yet.</p>
        {onRetry && (
          <button className="btn btn-ghost btn-sm" type="button" onClick={retry}>
            <RefreshCw size={14} />
            Try again
          </button>
        )}
      </div>
    )
  }

  if (!iframeSrc) {
    return (
      <div className="stream-fallback" role="alert">
        <AlertTriangle size={22} />
        <p>This video could not be opened. Check your connection and try again.</p>
        <button className="btn btn-ghost btn-sm" type="button" onClick={retry}>
          <RefreshCw size={14} />
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="stream-shell is-live">
      <iframe
        key={boot}
        ref={frame}
        className="stream-frame is-playing"
        src={iframeSrc}
        title={title}
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
        referrerPolicy="origin"
        allowFullScreen
        onError={() => setFailed(true)}
        onLoad={() => {
          const player = playerRef.current
          if (!player || pausedRef.current) return
          try {
            if ('muted' in player) player.muted = true
            player.play?.()
          } catch {
            /* SDK start() still runs */
          }
        }}
      />

      {silent && (
        <button
          type="button"
          className="stream-sound"
          onClick={() => {
            const player = playerRef.current
            try {
              if (player && 'muted' in player) player.muted = false
              player?.play?.()
            } catch {
              /* the player's own control is still there */
            }
            setSilent(false)
          }}
        >
          <Volume2 size={15} />
          Tap for sound
        </button>
      )}

      {failed && (
        <div className="stream-fallback stream-fallback-error" role="alert">
          <AlertTriangle size={22} />
          <p>This video could not be played. Check your connection and try again.</p>
          <button className="btn btn-ghost btn-sm" type="button" onClick={retry}>
            <RefreshCw size={14} />
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
