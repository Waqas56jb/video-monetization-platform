import { useEffect, useRef, useState } from 'react'

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

  useEffect(() => {
    if (!src) return
    let player = null
    let alive = true

    loadSdk().then((Stream) => {
      if (!alive || !Stream || !frame.current) return
      try {
        player = Stream(frame.current)
        player.addEventListener('ended', () => onEnded?.())
        player.addEventListener('timeupdate', () => onTimeUpdate?.(player.currentTime, player.duration))
        player.addEventListener('play', () => setReady(true))
      } catch {
        /* the iframe plays regardless */
      }
    })

    return () => {
      alive = false
      player = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  if (!src) return null

  const url = new URL(src)
  if (poster) url.searchParams.set('poster', poster)
  if (autoplay) url.searchParams.set('autoplay', 'true')
  url.searchParams.set('preload', 'metadata')

  return (
    <iframe
      ref={frame}
      className={`stream-frame ${ready ? 'is-playing' : ''}`.trim()}
      src={url.toString()}
      title={title}
      loading="lazy"
      allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
      allowFullScreen
    />
  )
}
