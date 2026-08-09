import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'

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

function buildSrc(src, poster, autoplay) {
  try {
    const url = new URL(src)
    if (poster) url.searchParams.set('poster', poster)
    if (autoplay) {
      url.searchParams.set('autoplay', 'true')
      url.searchParams.set('muted', 'true')
    }
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
  title = 'Video player',
}) {
  const frame = useRef(null)
  const [ready, setReady] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const iframeSrc = useMemo(
    () => (src ? buildSrc(src, poster, autoplay) : null),
    [src, poster, autoplay]
  )

  const markReady = () => setReady(true)

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
  }, [iframeSrc])

  useEffect(() => {
    if (!iframeSrc) return
    let player = null
    let alive = true

    loadSdk().then((Stream) => {
      if (!alive || !Stream || !frame.current) return
      try {
        player = Stream(frame.current)
        player.addEventListener('ended', () => onEnded?.())
        player.addEventListener('timeupdate', () =>
          onTimeUpdate?.(player.currentTime, player.duration)
        )
        player.addEventListener('loadeddata', markReady)
        player.addEventListener('play', markReady)
        player.addEventListener('canplay', markReady)
      } catch {
        /* iframe still plays */
      }
    })

    return () => {
      alive = false
      player = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iframeSrc])

  if (!src) {
    return (
      <div className="stream-fallback" role="status">
        <AlertTriangle size={22} />
        <p>Playback is not available for this video yet.</p>
      </div>
    )
  }

  if (!iframeSrc) {
    return (
      <div className="stream-fallback" role="alert">
        <AlertTriangle size={22} />
        <p>This video could not be opened. Please refresh and try again.</p>
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
        ref={frame}
        className={`stream-frame ${ready ? 'is-playing' : ''}`.trim()}
        src={iframeSrc}
        title={title}
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
        allowFullScreen
        onLoad={() => {
          // SDK events can be late; drop the poster shortly after the frame loads.
          setTimeout(markReady, 450)
        }}
      />

      {timedOut && !ready && (
        <div className="stream-fallback stream-fallback-overlay" role="status">
          <AlertTriangle size={22} />
          <p>
            The player is taking longer than usual. Check your connection, or try again in a
            moment.
          </p>
        </div>
      )}
    </div>
  )
}
