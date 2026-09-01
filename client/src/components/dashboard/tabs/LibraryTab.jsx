import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BadgeCheck, Compass, Library, X } from 'lucide-react'
import VideoCard from '@/components/ui/VideoCard'
import { EmptyState, ErrorState, SkeletonCards } from '@/components/ui/States'
import useApi from '@/hooks/useApi'
import { toCard, videoLink } from '@/lib/videoView'
import api from '@/lib/api'
import { useSaved } from '@/context/SavedContext'
import { useToast } from '@/context/ToastContext'

/**
 * My Library — the four rows the client asked for, in the order they asked for
 * them: Continue Watching, Purchased, My List, Recently Watched.
 *
 * ONE REQUEST FOR ALL FOUR. `GET /api/library` answers them together. Four
 * separate calls would be four requests every time this tab is opened, on top of
 * what the dashboard already asks for, against a limiter of 120 a minute — and
 * the whole point of the batching is that opening the library is cheap enough
 * that nobody has to think about it.
 *
 * Empty rows are not drawn. A new viewer would otherwise meet four headings and
 * four "nothing here yet" boxes, which reads as a broken page rather than an
 * empty one. Only the Purchased row keeps its empty state, because that is the
 * one with somewhere to send them.
 */

function Row({ title, subtitle, videos, owned = false, onForget }) {
  if (!videos?.length) return null
  return (
    <section className="lib-row">
      <div className="lib-row-head">
        <h3>{title}</h3>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="lib-grid">
        {videos.map((v) => {
          const card = toCard(v, { owned })
          return (
            <div className="lib-item" key={`${title}-${v.id}`}>
              <VideoCard video={card} to={videoLink(v)} state={{ preview: card }} />
              {/* A progress bar the viewer can read at a glance, from the number
                  the server already sent — no second calculation here, and no
                  need for this component to know what "finished" means. */}
              {v.percentWatched != null && (
                <div
                  className="lib-progress"
                  role="progressbar"
                  aria-valuenow={v.percentWatched}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${v.percentWatched}% watched`}
                >
                  <span style={{ width: `${v.percentWatched}%` }} />
                </div>
              )}
              {onForget && (
                <button
                  type="button"
                  className="lib-forget"
                  onClick={() => onForget(v)}
                  aria-label={`Remove ${v.title} from history`}
                  title="Remove from history"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default function LibraryTab() {
  const navigate = useNavigate()
  const showToast = useToast()
  const { seed } = useSaved()
  const { data, loading, error, reload, setData } = useApi(() => api.library.list(), [])

  const purchased = data?.purchased || data?.videos || []
  const watching = data?.continueWatching || []
  const list = data?.myList || []
  const recent = data?.recentlyWatched || []

  /* The batched response already says what this viewer has saved, so the Save
     buttons on these cards do not need their own request. */
  useEffect(() => {
    if (data?.savedIds) seed(data.savedIds)
  }, [data?.savedIds, seed])

  /**
   * Remove from history, optimistically and from both rows at once.
   *
   * Continue Watching and Recently Watched are the same rows read two ways, so
   * hiding one hides the other — doing it locally as well keeps the two in step
   * without a refetch. The position is kept: reopening the film still resumes.
   */
  const forget = async (video) => {
    const without = (rows) => rows.filter((r) => r.id !== video.id)
    const before = data
    setData({ ...data, continueWatching: without(watching), recentlyWatched: without(recent) })
    try {
      await api.library.forget(video.id)
    } catch (err) {
      setData(before)
      showToast(err?.message || 'Could not remove that from your history')
    }
  }

  const nothingAtAll =
    !purchased.length && !watching.length && !list.length && !recent.length

  return (
    <div>
      <div
        className="panel"
        style={{ background: 'rgba(34,197,94,.06)', borderColor: 'rgba(34,197,94,.25)' }}
      >
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <BadgeCheck style={{ color: 'var(--green)', width: 26, height: 26, flexShrink: 0 }} />
          <div>
            <b style={{ fontFamily: 'Sora' }}>What you buy stays in your library.</b>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3 }}>
              Every video you have purchased stays unlocked on any device you log into — even
              after logout, and even if it is later taken off the public site.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <SkeletonCards count={4} />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : nothingAtAll ? (
        <EmptyState
          icon={Library}
          title="Your library is empty"
          message="Anything you buy lands here and stays in your library — on every device you sign in to. Videos you save or start watching show up here too."
          action={
            <button className="btn btn-gold" onClick={() => navigate('/explore')}>
              <Compass />
              Browse videos
            </button>
          }
        />
      ) : (
        <>
          <Row
            title="Continue Watching"
            subtitle="Pick up where you stopped."
            videos={watching}
            onForget={forget}
          />
          <Row
            title="Purchased"
            subtitle="Yours for good, on every device."
            videos={purchased}
            owned
          />
          <Row title="My List" subtitle="Saved to watch later." videos={list} />
          <Row
            title="Recently Watched"
            subtitle="Everything you have opened lately."
            videos={recent}
            onForget={forget}
          />
        </>
      )}
    </div>
  )
}
