import { useEffect, useState } from 'react'

/**
 * The one loading state a viewer sees between tapping a video and its first
 * frame: the poster with the MTONYO+ ring over it.
 *
 * The skeleton (while the Watch chunk and the video's data load) and the
 * player overlay (while Cloudflare boots) both draw THIS, in the same box, so
 * handing over from one to the other changes nothing on screen. They used to
 * be two different layouts on a bare black stage, and the change between them
 * was the "black → poster → spinner" sequence the client kept seeing.
 *
 * When `show` turns false it fades out instead of vanishing, so the film
 * replaces the poster rather than cutting to it.
 */
export default function PlayerLoading({ poster, show = true }) {
  const [mounted, setMounted] = useState(show)
  useEffect(() => {
    if (show) {
      setMounted(true)
      return undefined
    }
    const t = setTimeout(() => setMounted(false), 420)
    return () => clearTimeout(t)
  }, [show])
  if (!mounted) return null
  return (
    <div
      className={`player-loading${show ? '' : ' is-leaving'}`}
      role="status"
      aria-label="Loading video"
      aria-hidden={show ? undefined : 'true'}
    >
      {poster ? (
        <img className="player-loading-poster" src={poster} alt="" draggable={false} decoding="sync" fetchpriority="high" />
      ) : null}
      <span className="mt-loader" aria-hidden="true" />
    </div>
  )
}
