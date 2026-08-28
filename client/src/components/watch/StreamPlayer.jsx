import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Play, RefreshCw, Volume2 } from 'lucide-react'
import { AD_AIRTIME_FLOOR } from '@/lib/adSkip'

/**
 * Cloudflare Stream iframe player.
 *
 * The iframe paints white for a beat before Stream's player boots. We cover
 * that with the video poster (black underneath) until playback is actually
 * ready — so the user never sees a blank white flash.
 */
const SDK = 'https://embed.cloudflarestream.com/embed/sdk.latest.js'

let sdkPromise = null
function loadSdk() {
  if (typeof window === 'undefined') return Promise.resolve(null)
  if (window.Stream) return Promise.resolve(window.Stream)
  if (sdkPromise) return sdkPromise

  sdkPromise = new Promise((resolve) => {
    const el = document.createElement('script')
    el.src = SDK
    el.async = true
    el.onload = () => resolve(window.Stream || null)
    el.onerror = () => resolve(null)
    document.head.appendChild(el)
  })
  return sdkPromise
}

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
  poster,
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
  const [ready, setReady] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const [needsGesture, setNeedsGesture] = useState(false)
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
   * Pin startTime to the moment this source first loads.
   *
   * After payment, resumeHint and the server resume point can disagree by a
   * second. Putting startAt in the iframe URL meant every tiny change remounted
   * Stream — a new big play button each time. Seek still happens via the SDK.
   */
  const pin = useRef({ src: null, startAt: 0 })
  if (src !== pin.current.src) {
    pin.current = { src, startAt: Math.max(0, Number(startAt) || 0) }
  } else if (playOnReady && Number(startAt) > (pin.current.startAt || 0) + 0.4) {
    pin.current = { src, startAt: Math.max(0, Number(startAt) || 0) }
  }
  const resumeAt = pin.current.startAt
  const iframeSrc = useMemo(
    () => (src ? buildSrc(src, resumeAt, controls) : null),
    [src, resumeAt, controls]
  )

  const kickFromGesture = () => {
    const player = playerRef.current
    try {
      if (player && 'muted' in player) player.muted = true
      player?.play?.()
    } catch {
      /* overlay stays until time actually moves */
    }
  }
  const markReady = () => setReady(true)
  const retry = () => {
    if (onRetry && (!src || !iframeSrc)) {
      onRetry()
      return
    }
    setReady(false)
    setTimedOut(false)
    setBoot((n) => n + 1)
  }

  useEffect(() => {
    setReady(false)
    setTimedOut(false)
    setNeedsGesture(false)
    if (!iframeSrc) return

    const timer = setTimeout(() => {
      setTimedOut(true)
    }, 12000)
    return () => clearTimeout(timer)
  }, [iframeSrc, boot])

  useEffect(() => {
    if (!iframeSrc) return
    let player = null
    let alive = true
    let kickTimer = null
    let watchdog = null
    let stopPoll = null

    loadSdk().then((Stream) => {
      if (!alive || !Stream || !frame.current) return
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
          if (!stopped) {
            stopped = true
            onStopReachedRef.current?.()
          }
          onTimeUpdateRef.current?.(limit, player.duration)
        }
        player.addEventListener('timeupdate', haltIfDue)
        stopPoll = setInterval(haltIfDue, 200)
        let aired = false
        let unmutedAt = 0
        const shown = () => {
          if (aired) return
          aired = true
          markReady()
          setNeedsGesture(false)
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
          try {
            setSilent(Boolean(player.muted))
          } catch {
            /* ignore */
          }
          if (requireAirtimeRef.current) return
          if (!playOnReadyRef.current && !autoplayRef.current) return
          try {
            if ('muted' in player) {
              player.muted = false
              unmutedAt = Date.now()
              setTimeout(() => {
                if (alive) setSilent(Boolean(player.muted))
              }, 1200)
            }
          } catch {
            /* stay muted; tap-for-sound still covers it */
          }
        }
        const uncoverFilm = () => {
          /* Drop the boot overlay as soon as Stream has a frame. Ads still
             wait for real airtime before Skip / billing — that lives in
             noteIfAiring, not on this cover. */
          markReady()
          setNeedsGesture(false)
          onReadyRef.current?.()
          if (requireAirtimeRef.current) return
          onPlayingRef.current?.()
        }
        // The film uncovers as soon as Stream has a frame, so
        // "Connecting to player…" does not sit for 20–30s.
        player.addEventListener('loadedmetadata', uncoverFilm)
        player.addEventListener('loadeddata', uncoverFilm)
        player.addEventListener('canplay', uncoverFilm)
        player.addEventListener('playing', () => noteIfAiring())
        player.addEventListener('timeupdate', () => noteIfAiring())

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
            if (!(await play(true))) {
              setNeedsGesture(true)
              return
            }
            noteIfAiring()
          }

          const onPause = () => {
            if (!alive || aired) return
            if (!unmutedAt || Date.now() - unmutedAt > 2000) return
            play(true)
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
          player.addEventListener('pause', onPause)
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
              setNeedsGesture(true)
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
      player = null
      if (kickTimer) clearTimeout(kickTimer)
      if (watchdog) clearInterval(watchdog)
      if (stopPoll) clearInterval(stopPoll)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iframeSrc, boot])

  useEffect(() => {
    const player = playerRef.current
    if (!player) return
    try {
      if (paused) player.pause?.()
      else if (playOnReady || autoplay) player.play?.()
    } catch {
      /* overlay / watchdog still cover a refused play */
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
    <div className={`stream-shell ${ready ? 'is-ready' : 'is-booting'}`.trim()}>
      {/* Poster covers the white iframe boot flash */}
      {poster && (
        <img
          className={`stream-poster ${ready ? 'is-hidden' : ''}`.trim()}
          src={poster}
          alt=""
          draggable={false}
        />
      )}
      {!poster && !ready && <div className="stream-poster stream-poster-fallback" aria-hidden="true" />}
      {!paused && !ready && !timedOut && !needsGesture && (
        <p className="stream-boot-msg">Connecting to player…</p>
      )}
      {!paused && needsGesture && !timedOut && (
        <button type="button" className="stream-tap" onClick={kickFromGesture}>
          <span className="stream-tap-hit">
            <Play size={22} />
            Tap to play
          </span>
        </button>
      )}

      <iframe
        key={boot}
        ref={frame}
        className={`stream-frame ${ready ? 'is-playing' : ''}`.trim()}
        src={iframeSrc}
        title={title}
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
        referrerPolicy="origin"
        allowFullScreen
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

      {timedOut && !ready && (
        <div className="stream-fallback stream-fallback-overlay" role="status">
          <AlertTriangle size={22} />
          <p>
            The player is taking longer than usual. Check your connection, then try again.
          </p>
          <button className="btn btn-ghost btn-sm" type="button" onClick={retry}>
            <RefreshCw size={14} />
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
