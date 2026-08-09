import { useNavigate } from 'react-router-dom'
import { Flame, LayoutGrid, Rocket } from 'lucide-react'
import Reveal from '@/components/ui/Reveal'
import VideoCard from '@/components/ui/VideoCard'
import { EmptyState, ErrorState, SkeletonCards } from '@/components/ui/States'
import useApi from '@/hooks/useApi'
import { toCard, videoLink } from '@/lib/videoView'
import api from '@/lib/api'

/**
 * What people are actually watching.
 *
 * Ordered by real view counts, and only ever showing videos an administrator
 * has approved — the same list any visitor could reach through Explore. When
 * nothing is published yet it says so and invites the first creator, which is
 * a far better first impression than eight fabricated hits.
 */
export default function Trending() {
  const navigate = useNavigate()
  const { data, loading, error, reload } = useApi(
    () => api.videos.list({ sort: 'popular', limit: 8 }),
    []
  )
  const videos = data?.videos || []

  return (
    <section className="section" id="trending">
      <div className="container">
        <Reveal className="section-head">
          <span className="badge">
            <Flame style={{ width: 14, height: 14 }} />
            TRENDING NOW
          </span>
          <h2>
            Hot Videos <span className="grad-text">Everyone&apos;s Buying</span>
          </h2>
          <p>
            Exclusive premieres and pay-per-view drops from Tanzanian creators. Watch the free
            preview, pay with mobile money, keep watching forever.
          </p>
        </Reveal>

        {loading ? (
          <SkeletonCards count={4} />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !videos.length ? (
          <EmptyState
            icon={Flame}
            title="Nothing published yet"
            message="The first videos will appear here the moment creators upload them and the team approves them."
            action={
              <button className="btn btn-gold" onClick={() => navigate('/signup')}>
                <Rocket />
                Be the first creator
              </button>
            }
          />
        ) : (
          <div className="vid-grid">
            {videos.map((v, i) => (
              <VideoCard
                key={v.id}
                video={toCard(v)}
                reveal
                delay={i}
                onClick={() => navigate(videoLink(v))}
              />
            ))}
          </div>
        )}

        {videos.length > 0 && (
          <Reveal className="center" style={{ marginTop: 44 }}>
            <button className="btn btn-ghost" onClick={() => navigate('/explore')}>
              <LayoutGrid />
              Explore All Videos
            </button>
          </Reveal>
        )}
      </div>
    </section>
  )
}
