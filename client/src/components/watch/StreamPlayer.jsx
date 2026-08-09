import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'

/**
 * The real player.
 *
 * Cloudflare's embedded player rather than a bare <video>, for one practical
 * reason: the streams are HLS, and Chrome and Firefox will not play HLS
 * natively. The alternatives were shipping a hundred kilobytes of hls.js or
 * using the player Cloudflare already serves — which also handles quality
 * switching on a bad connection, which is most connections here.
 *
 * The src is a signed, short-lived token, so a locked video's URL is never in
 * the page at all. There is nothing in devtools to copy.
 *
 * Their SDK is loaded only to hear when playback ends, so the paywall can
 * appear at the exact moment the preview runs out. If it fails to load —
 * blocked, offline, changed — the video still plays and the paywall is still
 * reachable from the button underneath. Losing a nicety is acceptable;
 * losing playback is not.
 *
 * A blank white rectangle usually means the Stream video's `allowedOrigins`
 * was locked to localhost when the asset was created. Repair with
 * `npm run cf:origins -- --fix` on the server — the iframe itself cannot fix that.
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
    el.onerror = () => resolve(null) // the player still works without it
    document.head.appendChild(el)
  })
  return sdkPromise
}

function buildSrc(src, poster, autoplay) {
  try {
    const url = new URL(src)
    if (poster) url.searchParams.set('poster', poster)
    if (autoplay) url.searchParams.set('autoplay', 'true')
    url.searchParams.set('preload', 'metadata')
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
  const iframeSrc = useMemo(() => (src ? buildSrc(src, poster, autoplay) : null), [src, poster, autoplay])

  useEffect(() => {
    setReady(false)
    setTimedOut(false)
    if (!iframeSrc) return

    // If Cloudflare refuses the embed (wrong allowedOrigins), the iframe stays
    // white and never fires play. Surface that after a short wait.
    const timer = setTimeout(() => {
      if (!ready) setTimedOut(true)
    }, 8000)
    return () => clearTimeout(timer)
  }, [iframeSrc]) // eslint-disable-line react-hooks/exhaustive-deps -- only reset on new src

  useEffect(() => {
    if (!iframeSrc) return
    let player = null
    let alive = true

    loadSdk().then((Stream) => {
      if (!alive || !Stream || !frame.current) return
      try {
        player = Stream(frame.current)
        player.addEventListener('ended', () => onEnded?.())
        player.addEventListener('timeupdate', () => onTimeUpdate?.(player.currentTime, player.duration))
        player.addEventListener('play', () => setReady(true))
        player.addEventListener('loadeddata', () => setReady(true))
      } catch {
        /* the iframe plays regardless */
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
    <div className="stream-shell">
      <iframe
        ref={frame}
        className={`stream-frame ${ready ? 'is-playing' : ''}`.trim()}
        src={iframeSrc}
        title={title}
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
        allowFullScreen
      />
      {timedOut && !ready && (
        <div className="stream-fallback stream-fallback-overlay" role="status">
          <AlertTriangle size={22} />
          <p>
            The player could not start. This is usually an embed-permission issue on the video
            itself. Try again in a moment, or open the video from another device.
          </p>
        </div>
      )}
    </div>
  )
}
