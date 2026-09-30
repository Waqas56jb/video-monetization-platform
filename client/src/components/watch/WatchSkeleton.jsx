import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { measurePerf } from '@/lib/perfLog'
import { videoShape } from '@/lib/videoShape'
import PlayerLoading from '@/components/watch/PlayerLoading'

/**
 * What a cold /watch/:slug load already knows before any script runs: api/watch.js
 * writes the video's poster and shape into the page. Only trusted for the slug
 * it was written for — after an in-app navigation it describes a different film.
 */
export function bootMeta(videoId) {
  const m = typeof window !== 'undefined' ? window.__MTONYO_SHARE_META__ : null
  return m && videoId && m.slug === videoId ? m : null
}

/**
 * Watch's first paint — the Suspense fallback while the chunk downloads, and
 * Watch's own shell while the video's data loads.
 *
 * It draws the SAME player box Watch draws (same classes, same aspect ratio)
 * with the same PlayerLoading inside, so the hand-over to the real player
 * changes nothing on screen. The poster is the card's own image (already in
 * the browser's cache) or, on a cold link, the one api/watch.js wrote into the
 * page.
 */
export default function WatchSkeleton({ preview } = {}) {
  const { videoId } = useParams()
  const boot = bootMeta(videoId)
  const title = preview?.title || boot?.title
  const author = preview?.author || preview?.creator || boot?.creator
  const thumb = preview?.thumb || preview?.thumbnailUrl || boot?.thumbnailUrl || null
  const shape = videoShape(preview?.width || boot?.width, preview?.height || boot?.height)

  useEffect(() => {
    measurePerf('cardTap', 'card-to-skeleton')
  }, [])

  return (
    <div className="watch-wrap watch-shell-early" data-mtonyo-watch="prefetch">
      <div
        className={`player is-${shape.orientation}`}
        style={{ '--player-aspect': shape.aspect, '--player-ratio': String(shape.ratio) }}
        aria-busy="true"
      >
        <PlayerLoading poster={thumb} />
      </div>
      <div className="watch-info">
        {title ? (
          <>
            <h1 className="watch-preview-title">{title}</h1>
            {author && <p className="watch-preview-by">{author}</p>}
          </>
        ) : (
          <>
            <div className="skeleton" style={{ height: 28, width: '70%', marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 16, width: '40%' }} />
          </>
        )}
      </div>
    </div>
  )
}
