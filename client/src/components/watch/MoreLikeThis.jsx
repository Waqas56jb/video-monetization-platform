import { useNavigate } from 'react-router-dom'
import VideoCard from '@/components/ui/VideoCard'
import { ErrorState, SkeletonCards } from '@/components/ui/States'
import useApi from '@/hooks/useApi'
import { toCard, videoLink } from '@/lib/videoView'
import api from '@/lib/api'

function openVideo(navigate, video) {
  const path = videoLink(video)
  navigate(path)
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
}

/**
 * Other titles under the one you are watching — same category first, then
 * more from this creator, then the rest of the catalogue.
 *
 * A Watch page that ends at the paywall or the credits is a dead end. This
 * is the Netflix row: posters you can tap, with the real price, so discovery
 * keeps selling.
 */
export default function MoreLikeThis({ videoId }) {
  const navigate = useNavigate()
  const { data, loading, error, reload } = useApi(
    () => api.videos.related(videoId),
    [videoId],
    { skip: !videoId }
  )

  const videos = data?.videos || []

  if (!videoId) return null
  if (loading) {
    return (
      <section className="more-like" aria-busy="true">
        <h2>More like this</h2>
        <SkeletonCards count={4} />
      </section>
    )
  }
  if (error) {
    return (
      <section className="more-like">
        <h2>More like this</h2>
        <ErrorState error={error} onRetry={reload} title="Could not load more titles" />
      </section>
    )
  }
  if (!videos.length) return null

  return (
    <section className="more-like" aria-labelledby="more-like-title">
      <h2 id="more-like-title">More like this</h2>
      <p className="more-like-sub">Same category, more from this creator, and related titles.</p>
      <div className="more-like-row">
        {videos.map((v) => (
          <VideoCard
            key={v.id}
            video={toCard(v)}
            onClick={() => openVideo(navigate, v)}
          />
        ))}
      </div>
    </section>
  )
}
