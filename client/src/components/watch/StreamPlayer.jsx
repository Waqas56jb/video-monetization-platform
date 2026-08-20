import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

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

function buildSrc(src, poster, autoplay, startAt, controls) {
  try {
    const url = new URL(src)
    if (poster) url.searchParams.set('poster', poster)
    if (autoplay) {
      url.searchParams.set('autoplay', 'true')
      url.searchParams.set('muted', 'true')
    }
    // Where the full video should pick up — see `startAt` on the component.
    if (startAt > 0) url.searchParams.set('startTime', `${Math.floor(startAt)}s`)
    // An advert is not something the viewer drives.
    if (controls === false) url.searchParams.set('controls', 'false')
    url.searchParams.set('preload', 'auto')
    // Keep the letterbox black so Stream never flashes a white canvas.
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
}) {
  const frame = useRef(null)
  const onPlayingRef = useRef(onPlaying)
  onPlayingRef.current = onPlaying
  const [ready, setReady] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
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
  }
  const resumeAt = pin.current.startAt
  const iframeSrc = useMemo(
    () => (src ? buildSrc(src, poster, autoplay || playOnReady, resumeAt, controls) : null),
    [src, poster, autoplay, playOnReady, resumeAt, controls]
  )

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
    if (!iframeSrc) return

    const timer = setTimeout(() => {
      setTimedOut((was) => {
        // If still not ready after 10s, show help — but don't leave white.
        return true
      })
    }, 10000)
    return () => clearTimeout(timer)
  }, [iframeSrc, boot])

  useEffect(() => {
    if (!iframeSrc) return
    let player = null
    let alive = true
    let kickTimer = null
    let watchdog = null

    loadSdk().then((Stream) => {
      if (!alive || !Stream || !frame.current) return
      try {
        player = Stream(frame.current)
        player.addEventListener('ended', () => onEnded?.())
        player.addEventListener('timeupdate', () =>
          onTimeUpdate?.(player.currentTime, player.duration)
        )
        const shown = () => {
          markReady()
          onPlayingRef.current?.()
        }
        // After a purchase, keep the poster up until play actually starts.
        // loadeddata / iframe onLoad used to drop it early and leave Stream's
        // giant play button — the extra "Watch Now" after paying.
        if (!playOnReady) {
          player.addEventListener('loadeddata', markReady)
          player.addEventListener('canplay', markReady)
        }
        player.addEventListener('play', shown)
        player.addEventListener('playing', shown)

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

        if (playOnReady) {
          /**
           * Keep it playing, whatever the browser decides.
           *
           * The sequence here used to start muted — which every browser
           * allows — and then unmute a moment later. Chrome and Safari treat
           * unmuting a video the page started by itself as a fresh request for
           * permission, refuse it, and pause the element. The recovery read
           * `player.paused` to notice, but that is the SDK's copy of a value
           * carried by postMessage from another origin, so it still reported
           * "playing" and nothing ever restarted it.
           *
           * The viewer was left looking at the full film, parked on exactly
           * the right second, paused. That is the "I still have to press PLAY
           * again" in the client's report: measured on a phone-sized Chrome,
           * currentTime stopped dead at 8.0s with paused=true and no overlay
           * to explain it.
           *
           * So nothing here trusts the mirrored flag, and nothing accepts a
           * stall. Progress is read from timeupdate — the one signal that
           * means frames are actually moving — and anything that stops gets
           * muted and started again. Playing without sound is a poor result;
           * paused after paying is a broken one.
           */
          let started = false
          let unmutedAt = 0
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
            if (!alive || started) return
            started = true
            // Muted first: this is the one form of autoplay nothing blocks, so
            // the film is already running before sound is even asked for.
            if (!(await play(true))) {
              started = false
              return
            }
            shown()
            // Then ask for sound, because they watched the preview with it.
            try {
              if ('muted' in player) {
                player.muted = false
                unmutedAt = Date.now()
              }
            } catch {
              /* some embeds ignore unmute */
            }
          }

          /**
           * A pause within a moment of that unmute is the browser taking
           * playback away, not the viewer reaching for the controls. Put the
           * sound back and carry on. A pause any later is a person pressing
           * pause, and they are left alone.
           */
          const onPause = () => {
            if (!alive || !unmutedAt || Date.now() - unmutedAt > 2000) return
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
          player.addEventListener('pause', onPause)
          player.addEventListener('timeupdate', onTime)
          kickTimer = setTimeout(start, 350)

          /**
           * The watchdog, which is what actually makes this reliable.
           *
           * It does not care why the video is not moving — a refused unmute, a
           * stalled buffer, a policy this browser has and the last one did
           * not. If no frame has advanced for a couple of seconds it mutes and
           * plays again. Sound is worth one attempt; after that, playing
           * silently beats sitting still.
           */
          watchdog = setInterval(() => {
            if (!alive) return
            if (Date.now() - lastProgressAt < 2500) return
            if (attempts >= 6) {
              clearInterval(watchdog)
              watchdog = null
              shown()
              return
            }
            attempts += 1
            lastProgressAt = Date.now()
            play(attempts > 1)
          }, 1200)
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iframeSrc, boot])

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

      <iframe
        key={boot}
        ref={frame}
        className={`stream-frame ${ready ? 'is-playing' : ''}`.trim()}
        src={iframeSrc}
        title={title}
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        onLoad={() => {
          // After pay, do not uncover Stream's play button before playback
          // starts. Otherwise the viewer pays, then taps Watch, then taps again.
          if (playOnReady) return
          setTimeout(markReady, 450)
        }}
      />

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
