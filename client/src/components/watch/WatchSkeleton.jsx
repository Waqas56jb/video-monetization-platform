import { useEffect } from 'react'
import { measurePerf } from '@/lib/perfLog'

/**
 * Lightweight Watch shell — used as Suspense fallback (chunk loading) and as
 * Watch's first paint from router `state.preview` while API hydrates.
 */
export default function WatchSkeleton({ preview } = {}) {
  const title = preview?.title
  const author = preview?.author || preview?.creator
  const thumb = preview?.thumb || preview?.thumbnailUrl

  useEffect(() => {
    measurePerf('cardTap', 'card-to-skeleton')
  }, [])

  return (
    <div className="watch-wrap watch-shell-early" data-mtonyo-watch="prefetch">
      <div className="watch-preview-frame" aria-busy="true">
        {thumb ? (
          <img src={thumb} alt="" className="watch-preview-poster" decoding="async" />
        ) : (
          <div className="skeleton skeleton-player" />
        )}
        <p className="watch-preview-msg">Loading video…</p>
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
