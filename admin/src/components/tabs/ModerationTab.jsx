import { useState } from 'react'
import { Flag, ShieldCheck, Trash2 } from 'lucide-react'
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
const REASON_LABEL = {
  copyright: 'Copyright',
  inappropriate: 'Inappropriate',
  misleading: 'Misleading',
  illegal: 'Illegal',
  other: 'Other',
}

export default function ModerationTab() {
  const showToast = useToast()
  const { data, loading, error, reload } = useApi(() => api.admin.deletionRequests(), [])
  const requests = data?.requests || []

  /**
   * What viewers have flagged.
   *
   * Reports used to have nowhere to go — the policy page gave an email address
   * and nothing connected it to this queue, so a copyright claim depended on
   * somebody remembering to forward it. They arrive here now, alongside the
   * removal requests, because they are the same job.
   */
  const reports = useApi(() => api.admin.reports({ status: 'open', limit: 50 }), [])
  const [reportBusy, setReportBusy] = useState(null)

  const decideReport = async (r, decision, unpublish) => {
    setReportBusy(r.id)
    try {
      await api.admin.decideReport(r.id, { decision, unpublish })
      showToast(
        decision === 'uphold'
          ? unpublish
            ? `Report upheld — "${r.title}" taken down`
            : 'Report upheld'
          : 'Report dismissed'
      )
      reports.reload({ quiet: true })
    } catch (err) {
      showToast(err.message)
    } finally {
      setReportBusy(null)
    }
  }

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

  const openReports = reports.data?.reports || []

  return (
    <div className="tab">
      <Panel
        title={`Reported Content${openReports.length ? ` · ${openReports.length}` : ''}`}
        action={
          <span className="badge">
            <Flag style={{ width: 14, height: 14 }} />
            FROM VIEWERS
          </span>
        }
      >
        <Async
          loading={reports.loading}
          error={reports.error}
          onRetry={reports.reload}
          empty={!openReports.length}
          rows={2}
          emptyProps={{
            icon: Flag,
            title: 'Nothing reported',
            hint: 'Reports raised from a video land here. Copyright claims are the ones to read first.',
          }}
        >
          {openReports.map((r) => (
            <div className="review-card report-row" key={r.id}>
              <div className="rv-info">
                <b>{r.title}</b>
                <div className="rv-meta">
                  <span className={`pill ${r.reason === 'copyright' ? 'bad' : 'pend'}`}>
                    {REASON_LABEL[r.reason] || r.reason}
                  </span>
                  <span className="pill">{r.creator_name}</span>
                  {!r.is_published && <span className="pill">Already unpublished</span>}
                </div>
                {r.detail && <p className="rv-desc">{r.detail}</p>}
                <small className="rv-time">
                  Reported {timeAgo(r.created_at)}
                  {r.reporter_name ? ` by ${r.reporter_name}` : ' by a visitor'}
                  {r.reporter_email ? ` · ${r.reporter_email}` : ''}
                </small>
              </div>

              <div className="rv-actions">
                <button
                  className="btn btn-red btn-sm"
                  onClick={() => decideReport(r, 'uphold', true)}
                  disabled={reportBusy === r.id}
                >
                  Uphold &amp; take down
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => decideReport(r, 'uphold', false)}
                  disabled={reportBusy === r.id}
                >
                  Uphold only
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => decideReport(r, 'dismiss', false)}
                  disabled={reportBusy === r.id}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </Async>
      </Panel>

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
