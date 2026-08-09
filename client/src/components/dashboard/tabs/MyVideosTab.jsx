import { useState } from 'react'
import { Film, Play, Plus, Trash2 } from 'lucide-react'
import Panel from '../Panel'
import TableScroll from '@/components/ui/TableScroll'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import useApi, { tzs, compact, ACCESS_SHORT } from '@/hooks/useApi'
import api from '@/lib/api'
import { useToast } from '@/context/ToastContext'
import VideoPreview from '@/components/dashboard/VideoPreview'

/**
 * Everything this creator has uploaded, in whatever state it is in.
 *
 * There is no delete button, and there never will be. A creator may *request*
 * removal; an admin decides. That is the client's rule, and it exists because
 * somebody may have paid for the video — their purchase must not vanish
 * because the creator changed their mind.
 */
export default function MyVideosTab({ onNewUpload }) {
  const showToast = useToast()
  const [previewing, setPreviewing] = useState(null)
  const { data, loading, error, reload } = useApi(() => api.videos.mine(), [])
  const videos = data?.videos || []

  const requestRemoval = async (v) => {
    const reason = window.prompt(
      `Ask an administrator to take down "${v.title}"?\n\n` +
        'Anyone who has already bought it keeps their access — that never changes.\n' +
        'Tell them why (optional):'
    )
    if (reason === null) return
    try {
      const res = await api.videos.requestDeletion(v.id, reason.trim() || undefined)
      showToast(res.message || 'Removal requested')
      reload({ quiet: true })
    } catch (err) {
      showToast(err.message)
    }
  }

  return (
    <Panel
      title="My Videos"
      action={
        <button className="btn btn-gold btn-sm" onClick={onNewUpload}>
          <Plus />
          <span className="btn-label">New Upload</span>
        </button>
      }
    >
      {loading ? (
        <Skeleton rows={4} />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !videos.length ? (
        <EmptyState
          icon={Film}
          title="You haven't uploaded anything yet"
          message="Upload your first video and set your own price. Every upload is reviewed before it goes live."
          action={
            <button className="btn btn-gold" onClick={onNewUpload}>
              <Plus />
              Upload a video
            </button>
          }
        />
      ) : (
        <TableScroll>
          <thead>
            <tr>
              <th>Video</th>
              <th>Type</th>
              <th>Price</th>
              <th>Views</th>
              <th>Sales</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {videos.map((v) => {
              const st = statusOf(v)
              return (
                <tr key={v.id}>
                  <td style={{ fontWeight: 700 }}>
                    {v.title}
                    {v.rejectionReason && (
                      <small
                        style={{ display: 'block', color: 'var(--muted)', fontWeight: 400, marginTop: 3 }}
                      >
                        {v.rejectionReason}
                      </small>
                    )}
                  </td>
                  <td>{ACCESS_SHORT[v.accessType] || v.accessType}</td>
                  <td>{v.accessType === 'free_with_ads' ? 'Free' : tzs(v.priceTzs)}</td>
                  <td>{compact(v.views)}</td>
                  <td>{compact(v.paidUnlocks)}</td>
                  <td>
                    <span className={`pill ${st.pill}`}>{st.label}</span>
                  </td>
                  <td>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setPreviewing(v)}
                      title="Watch this video"
                      style={{ marginRight: 6 }}
                    >
                      <Play size={14} />
                      <span className="btn-label">Watch</span>
                    </button>
                    {/* Requesting, never deleting. */}
                    {v.isPublished && !v.deletedAt && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => requestRemoval(v)}
                        title="Ask an administrator to take this down"
                      >
                        <Trash2 size={14} />
                        <span className="btn-label">Request removal</span>
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </TableScroll>
      )}

      <VideoPreview
        video={previewing}
        open={Boolean(previewing)}
        onClose={() => setPreviewing(null)}
      />
    </Panel>
  )
}

function statusOf(v) {
  if (v.deletedAt) return { pill: 'bad', label: 'Removed' }
  if (v.reviewStatus === 'rejected') return { pill: 'bad', label: 'Rejected' }
  if (v.reviewStatus === 'pending_review') return { pill: 'pend', label: 'Awaiting review' }
  if (v.isPublished) return { pill: 'ok', label: 'Live' }
  if (v.reviewStatus === 'approved') return { pill: 'ok', label: 'Approved' }
  if (v.state === 'processing') return { pill: 'pend', label: 'Processing' }
  if (v.state === 'failed') return { pill: 'bad', label: 'Upload failed' }
  return { pill: '', label: 'Draft' }
}
