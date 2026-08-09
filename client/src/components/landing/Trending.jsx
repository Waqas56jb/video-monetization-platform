import { useNavigate } from 'react-router-dom'
import { Flame, LayoutGrid } from 'lucide-react'
import Reveal from '@/components/ui/Reveal'
import VideoCard from '@/components/ui/VideoCard'
import { LANDING_SHOWCASE } from '@/data/copy'

/**
 * Homepage marketing grid.
 *
 * Always shows the polished showcase cards so the landing design stays full —
 * Paid Premiere, PPV Forever, and Free With Ads at a glance. The real
 * catalogue (including demo-seed videos) lives on Explore / Watch / Dashboard.
 * Tapping a card sends people there to browse what is actually published.
 */
export default function Trending() {
  const navigate = useNavigate()

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
            Exclusive premieres and pay-per-view drops from Tanzania&apos;s biggest creators. Watch
            the free preview, pay with mobile money, keep watching forever.
          </p>
        </Reveal>

        <div className="vid-grid">
          {LANDING_SHOWCASE.map((video, i) => (
            <VideoCard
              key={video.id}
              video={video}
              reveal
              delay={i}
              onClick={() => navigate('/explore')}
            />
          ))}
        </div>

        <Reveal className="center" style={{ marginTop: 44 }}>
          <button className="btn btn-ghost" onClick={() => navigate('/explore')}>
            <LayoutGrid />
            Explore All Videos
          </button>
        </Reveal>
      </div>
    </section>
  )
}
