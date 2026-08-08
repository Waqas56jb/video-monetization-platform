import { useState } from 'react'
import { ShieldCheck, Trash2 } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import { Async } from '@/components/ui/States'
import useApi, { timeAgo } from '@/hooks/useApi'
import api from '@/lib/api'
import { useToast } from '@/context/ToastContext'

/**
 * Removal requests from creators.
 *
 * The client was explicit about this: a creator may ask for something to come
 * down, but they cannot make it disappear themselves, and anything already
 * bought must survive. So there are three outcomes here, and only one of them
 * is "remove" — the others keep the video reachable for the people who paid.
 */
export default function ModerationTab() {
  const showToast = useToast()
  const { data, loading, error, reload } = useApi(() => api.admin.deletionRequests(), [])
  const requests = data?.requests || []

  const [openId, setOpenId] = useState(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const decide = async (r, decision) => {
    setBusy(true)
    try {
      await api.admin.decideDeletion(r.id, { decision, note: note.trim() || undefined })
      showToast(
        decision === 'approve'
          ? `"${r.title}" removed — buyers keep their access`
          : decision === 'unpublish'
            ? `"${r.title}" unpublished`
            : 'Request declined — the creator has been told'
      )
      setOpenId(null)
      setNote('')
      reload({ quiet: true })
    } catch (err) {
      showToast(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tab">
      <Panel
        title={`Removal Requests${requests.length ? ` · ${requests.length}` : ''}`}
        action={
          <span className="badge">
            <ShieldCheck style={{ width: 14, height: 14 }} />
            PURCHASED CONTENT NEVER DISAPPEARS
          </span>
        }
      >
        <Async
          loading={loading}
          error={error}
          onRetry={reload}
          empty={!requests.length}
          rows={3}
          emptyProps={{
            icon: ShieldCheck,
            title: 'Nothing to moderate',
            hint: 'When a creator asks for one of their videos to be taken down, it appears here for a decision.',
          }}
        >
          {requests.map((r) => (
            <div className="review-card" key={r.id}>
              <div className="rv-thumb">
                {r.thumbnail_url ? (
                  <img src={r.thumbnail_url} alt="" loading="lazy" />
                ) : (
                  <span className="v-thumb-blank" />
                )}
              </div>

              <div className="rv-info">
                <b>{r.title}</b>
                <div className="rv-creator">
                  <span>
                    Requested by {r.creator_name} <small>{timeAgo(r.created_at)}</small>
                  </span>
                </div>
                {r.reason && <p className="rv-desc">“{r.reason}”</p>}
                <div className="rv-meta">
                  {r.buyers > 0 ? (
                    <span className="pill warn">
                      {r.buyers} {r.buyers === 1 ? 'person has' : 'people have'} bought this
                    </span>
                  ) : (
                    <span className="pill">No purchases</span>
                  )}
                </div>
                {r.buyers > 0 && (
                  <small className="rv-time">
                    Whatever you choose, those {r.buyers === 1 ? 'purchase stays' : 'purchases stay'}{' '}
                    valid — the video is only ever hidden, never destroyed.
                  </small>
                )}
              </div>

              <div className="rv-actions">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setOpenId(openId === r.id ? null : r.id)
                    setNote('')
                  }}
                >
                  {openId === r.id ? 'Cancel' : 'Decide'}
                </button>
              </div>

              {openId === r.id && (
                <div className="rv-reject">
                  <label htmlFor={`note-${r.id}`}>A note for the creator (optional)</label>
                  <textarea
                    id={`note-${r.id}`}
                    rows={2}
                    value={note}
                    placeholder="Why you decided this way…"
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <div className="rv-reject-actions" style={{ flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => decide(r, 'reject')}
                      disabled={busy}
                    >
                      Decline the request
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => decide(r, 'unpublish')}
                      disabled={busy}
                    >
                      Unpublish only
                    </button>
                    <button
                      className="btn btn-red btn-sm"
                      onClick={() => decide(r, 'approve')}
                      disabled={busy}
                    >
                      <Trash2 size={14} />
                      Remove it
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </Async>
      </Panel>
    </div>
  )
}
