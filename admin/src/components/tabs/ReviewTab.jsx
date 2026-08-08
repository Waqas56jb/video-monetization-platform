import { useState } from 'react'
import { Check, Eye, ShieldAlert, X } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import { useAdminData } from '@/context/AdminDataContext'
import { useToast } from '@/context/ToastContext'
import { REJECT_REASONS, REVIEW_TOASTS } from '@/data/adminData'

/**
 * Content Review — the gate every creator upload must pass.
 *
 * Nothing a creator submits is publicly visible until an admin approves it
 * here. Rejection always carries a reason, which the creator sees so they can
 * fix and resubmit.
 */
export default function ReviewTab() {
  const { reviewQueue } = useAdminData()
  const showToast = useToast()
  const [rejectingId, setRejectingId] = useState(null)
  const [reason, setReason] = useState('')

  const startReject = (item) => {
    setRejectingId(item.id)
    setReason('')
  }

  const cancelReject = () => {
    setRejectingId(null)
    setReason('')
  }

  const approve = (item) => {
    reviewQueue.remove(item.id)
    showToast(REVIEW_TOASTS.approved)
  }

  const confirmReject = (item) => {
    if (!reason.trim()) {
      showToast(REVIEW_TOASTS.needReason)
      return
    }
    reviewQueue.remove(item.id)
    setRejectingId(null)
    setReason('')
    showToast(REVIEW_TOASTS.rejected)
  }

  return (
    <div className="tab">
      <Panel
        title="Pending Review"
        action={
          <span className="badge">
            <ShieldAlert style={{ width: 14, height: 14 }} />
            NOTHING GOES LIVE WITHOUT ADMIN APPROVAL
          </span>
        }
      >
        {reviewQueue.items.length === 0 && (
          <p style={{ color: 'var(--muted2)', fontSize: 13 }}>
            Queue is clear — every submission has been reviewed.
          </p>
        )}

        {reviewQueue.items.map((item) => (
          <div className={`review-card ${item.exiting ? 'row-exit' : ''}`.trim()} key={item.id}>
            <div className="rv-thumb">
              <img src={item.thumb} alt="" loading="lazy" />
              <span className="rv-duration">{item.duration}</span>
            </div>

            <div className="rv-info">
              <b>{item.title}</b>
              <div className="rv-creator">
                <img src={item.avatar} alt="" loading="lazy" />
                <span>
                  {item.creator} <small>{item.creatorId}</small>
                </span>
              </div>
              <p className="rv-desc">{item.description}</p>
              <div className="rv-meta">
                <span className="pill free">{item.category}</span>
                <span className="pill pend">{item.type}</span>
                <span className="pill ok">{item.price}</span>
                <span className="pill info">{item.preview}</span>
              </div>
              <small className="rv-time">Submitted {item.submitted}</small>
            </div>

            <div className="rv-actions">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => showToast(`Opening preview player for "${item.title}"`)}
              >
                <Eye />
                Preview
              </button>
              <button className="btn btn-green btn-sm" onClick={() => approve(item)}>
                <Check />
                Approve
              </button>
              <button className="btn btn-red btn-sm" onClick={() => startReject(item)}>
                <X />
                Reject
              </button>
            </div>

            {rejectingId === item.id && (
              <div className="rv-reject">
                <label htmlFor={`reason-${item.id}`}>
                  Rejection reason — the creator will see this
                </label>

                <div className="rv-presets">
                  {REJECT_REASONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={`rv-preset ${reason === r ? 'on' : ''}`.trim()}
                      onClick={() => setReason(r)}
                    >
                      {r}
                    </button>
                  ))}
                </div>

                <textarea
                  id={`reason-${item.id}`}
                  rows={3}
                  value={reason}
                  placeholder="Explain what the creator needs to fix before resubmitting…"
                  onChange={(e) => setReason(e.target.value)}
                />

                <div className="rv-reject-actions">
                  <button className="btn btn-ghost btn-sm" onClick={cancelReject}>
                    Cancel
                  </button>
                  <button className="btn btn-red btn-sm" onClick={() => confirmReject(item)}>
                    <X />
                    Confirm Rejection
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </Panel>
    </div>
  )
}
