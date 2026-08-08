import { useNavigate } from 'react-router-dom'
import { BadgeCheck } from 'lucide-react'
import VideoCard from '@/components/ui/VideoCard'
import { LIBRARY_VIDEOS } from '@/data/content'

export default function LibraryTab() {
  const navigate = useNavigate()

  return (
    <div>
      <div
        className="panel"
        style={{ background: 'rgba(34,197,94,.06)', borderColor: 'rgba(34,197,94,.25)' }}
      >
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <BadgeCheck style={{ color: 'var(--green)', width: 26, height: 26, flexShrink: 0 }} />
          <div>
            <b style={{ fontFamily: 'Sora' }}>Your purchases are yours forever.</b>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3 }}>
              Every video below stays unlocked on any device you log into — even after logout.
            </p>
          </div>
        </div>
      </div>

      <div className="lib-grid">
        {LIBRARY_VIDEOS.map((v) => (
          <VideoCard key={v.id} video={v} onClick={() => navigate(`/watch/${v.id}`)} />
        ))}
      </div>
    </div>
  )
}
