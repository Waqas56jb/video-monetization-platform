import { useNavigate } from 'react-router-dom'
import { BadgeCheck, Compass, Library } from 'lucide-react'
import VideoCard from '@/components/ui/VideoCard'
import { EmptyState, ErrorState, SkeletonCards } from '@/components/ui/States'
import useApi from '@/hooks/useApi'
import { toCard, videoLink } from '@/lib/videoView'
import api from '@/lib/api'

/**
 * What this viewer owns.
 *
 * A purchase is permanent, so this list only ever grows. Even a video an
 * administrator has taken down stays watchable here — the client was explicit
 * that paid-for content must never vanish from under someone.
 */
export default function LibraryTab() {
  const navigate = useNavigate()
  const { data, loading, error, reload } = useApi(() => api.library.list(), [])
  const videos = data?.videos || []

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

      {loading ? (
        <SkeletonCards count={4} />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !videos.length ? (
        <EmptyState
          icon={Library}
          title="Your library is empty"
          message="Anything you buy lands here and stays yours — on every device, forever."
          action={
            <button className="btn btn-gold" onClick={() => navigate('/explore')}>
              <Compass />
              Browse videos
            </button>
          }
        />
      ) : (
        <div className="lib-grid">
          {videos.map((v) => (
            <VideoCard
              key={v.id}
              video={toCard(v, { owned: true })}
              onClick={() => navigate(videoLink(v))}
            />
          ))}
        </div>
      )}
    </div>
  )
}
