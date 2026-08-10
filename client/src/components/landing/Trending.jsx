import { useNavigate } from 'react-router-dom'
import { Flame, LayoutGrid } from 'lucide-react'
import VideoCard from '@/components/ui/VideoCard'
import { ErrorState, SkeletonCards } from '@/components/ui/States'
import useApi from '@/hooks/useApi'
import { toCard, videoLink } from '@/lib/videoView'
import api from '@/lib/api'

/**
 * Trending — the real catalogue, not a picture of one.
 *
 * This grid used to be drawn from a hard-coded showcase list, which meant the
 * cards had no video behind them: clicking one could only ever dump the viewer
 * on /explore to go and find it again. The client reported exactly that, and it
 * was not a routing mistake — there was genuinely nothing to route to.
 *
 * So the cards are real videos now, ordered by how much they are being watched,
 * and each one opens its own watch page.
 */
export default function Trending() {
  const navigate = useNavigate()

  const { data, loading, error, reload } = useApi(
    () => api.videos.list({ sort: 'trending', limit: 8 }),
    []
  )
  const videos = data?.videos || []

  return (
    <section className="section section-trending" id="trending">
      <div className="container">
        <div className="section-head">
          <span className="badge">
            <Flame style={{ width: 14, height: 14 }} />
            TRENDING NOW
          </span>
          <h2>
            Hot Videos <span className="grad-text">Everyone&apos;s Buying</span>
          </h2>
          <p>
            Exclusive premieres and Pay Once releases from Tanzania&apos;s biggest creators. Watch
            the free preview, pay your way, and it stays in your library.
          </p>
        </div>

        {loading ? (
          <SkeletonCards count={4} />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : videos.length === 0 ? (
          <div className="center" style={{ padding: '30px 0', color: 'var(--muted)' }}>
            <p>Nothing published yet — the first releases will appear here.</p>
          </div>
        ) : (
          <div className="vid-grid">
            {videos.map((v, i) => (
              <VideoCard
                key={v.id}
                video={toCard(v)}
                eager={i === 0}
                /* This exact video, not a page listing everything. */
                onClick={() => navigate(videoLink(v))}
              />
            ))}
          </div>
        )}

        <div className="center" style={{ marginTop: 44 }}>
          <button className="btn btn-ghost" onClick={() => navigate('/explore')}>
            <LayoutGrid />
            Explore All Videos
          </button>
        </div>
      </div>
    </section>
  )
}
