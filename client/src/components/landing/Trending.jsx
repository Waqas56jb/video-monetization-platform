import { useNavigate } from 'react-router-dom'
import { Flame, LayoutGrid } from 'lucide-react'
import VideoCard from '@/components/ui/VideoCard'
import { LANDING_SHOWCASE } from '@/data/copy'

/** Homepage marketing grid — always painted, no scroll-reveal. */
export default function Trending() {
  const navigate = useNavigate()

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
            Exclusive premieres and pay-per-view drops from Tanzania&apos;s biggest creators. Watch
            the free preview, pay with mobile money, keep watching forever.
          </p>
        </div>

        <div className="vid-grid">
          {LANDING_SHOWCASE.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              eager
              onClick={() => navigate('/explore')}
            />
          ))}
        </div>

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
