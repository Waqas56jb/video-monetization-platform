import { useState } from 'react'
import { Check, Play, ShieldAlert, ShieldCheck, X } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import { Async } from '@/components/ui/States'
import useApi, { tzs, timeAgo } from '@/hooks/useApi'
import api, { mediaUrl } from '@/lib/api'
import { useToast } from '@/context/ToastContext'
import VideoPreview from '@/components/ui/VideoPreview'

/**
 * Content Review — the gate every upload must pass.
 *
 * This is the client's rule made real: nothing a creator submits is publicly
 * visible until a human approves it here, and that is enforced by a trigger in
 * the database, not by this screen. A creator who bypassed the interface
 * entirely still could not publish themselves.
 *
 * The Paid Premiere window is set per video, right here, at the moment of
 * approval — so one artist can have 30 days and another 90.
 */
const REJECT_REASONS = [
  'Video quality is too low',
  'Audio is out of sync',
  'Copyrighted material without permission',
  'Thumbnail does not match the content',
  'Description is missing or misleading',
  'Breaks the community guidelines',
]

const ACCESS_LABEL = {
  ppv_forever: 'Pay Once',
  paid_premiere: 'Paid Premiere',
  free_with_ads: 'Free + Ads',
}

export default function ReviewTab() {
  const showToast = useToast()
  const { data, loading, error, reload } = useApi(() => api.admin.review('pending_review'), [])
  const queue = data?.queue || []

  const [previewing, setPreviewing] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [mode, setMode] = useState(null) // 'approve' | 'reject'
  const [reason, setReason] = useState('')
  const [terms, setTerms] = useState({})
  const [busy, setBusy] = useState(false)

  const startApprove = (v) => {
    setOpenId(v.id)
    setMode('approve')
    setTerms({
      accessType: v.accessType,
      priceTzs: v.priceTzs ?? 0,
      premiereDays: v.premiereDays ?? 30,
      note: '',
    })
  }

  const startReject = (v) => {
    setOpenId(v.id)
    setMode('reject')
    setReason('')
  }

  const close = () => {
    setOpenId(null)
    setMode(null)
    setReason('')
  }

  const approve = async (v) => {
    setBusy(true)
    try {
      const body = { accessType: terms.accessType, note: terms.note || undefined }
      if (terms.accessType !== 'free_with_ads') body.priceTzs = Number(terms.priceTzs) || 0
      if (terms.accessType === 'paid_premiere') body.premiereDays = Number(terms.premiereDays)

      await api.admin.approve(v.id, body)
      showToast(`"${v.title}" is approved and live`)
      close()
      reload({ quiet: true })
    } catch (err) {
      showToast(err.message)
    } finally {
      setBusy(false)
    }
  }

  const reject = async (v) => {
    if (reason.trim().length < 5) return showToast('Give the creator a reason they can act on')
    setBusy(true)
    try {
      await api.admin.reject(v.id, reason.trim())
      showToast(`"${v.title}" was rejected — the creator has been told why`)
      close()
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
        title={`Pending Review${queue.length ? ` · ${queue.length}` : ''}`}
        action={
          <span className="badge">
            <ShieldAlert style={{ width: 14, height: 14 }} />
            NOTHING GOES LIVE WITHOUT APPROVAL
          </span>
        }
      >
        <Async
          loading={loading}
          error={error}
          onRetry={reload}
          empty={!queue.length}
          rows={3}
          emptyProps={{
            icon: ShieldCheck,
            title: 'The queue is clear',
            hint: 'Every submission has been reviewed. New uploads appear here the moment a creator submits them.',
          }}
        >
          {queue.map((v) => (
            <div className="review-card" key={v.id}>
              <button
                className="rv-thumb rv-thumb-play"
                onClick={() => setPreviewing(v)}
                title="Watch this video"
                aria-label={`Watch ${v.title}`}
              >
                {v.thumbnailUrl ? (
                  <img src={mediaUrl(v.thumbnailUrl)} alt="" loading="lazy" />
                ) : (
                  <span className="v-thumb-blank" />
                )}
                <span className="rv-play">
                  <Play />
                </span>
                {v.durationSeconds > 0 && (
                  <span className="rv-duration">{formatDuration(v.durationSeconds)}</span>
                )}
              </button>

              <div className="rv-info">
                <b>{v.title}</b>
                <div className="rv-creator">
                  <span>
                    {v.creator?.name || v.creator?.email} <small>{v.creator?.email}</small>
                  </span>
                </div>
                {v.description && <p className="rv-desc">{v.description}</p>}
                <div className="rv-meta">
                  {v.category && <span className="pill free">{v.category}</span>}
                  <span className="pill pend">{ACCESS_LABEL[v.accessType] || v.accessType}</span>
                  {v.accessType !== 'free_with_ads' && <span className="pill ok">{tzs(v.priceTzs)}</span>}
                  {v.freePreviewSeconds > 0 && (
                    <span className="pill info">{Math.round(v.freePreviewSeconds / 60)} min free</span>
                  )}
                </div>
                <small className="rv-time">Submitted {timeAgo(v.submittedAt || v.createdAt)}</small>
              </div>

              <div className="rv-actions">
                {/* Watch it first. Approving something you have not seen is
                    the one thing this queue exists to prevent. */}
                <button className="btn btn-ghost btn-sm" onClick={() => setPreviewing(v)}>
                  <Play />
                  Watch
                </button>
                <button className="btn btn-green btn-sm" onClick={() => startApprove(v)}>
                  <Check />
                  Approve
                </button>
                <button className="btn btn-red btn-sm" onClick={() => startReject(v)}>
                  <X />
                  Reject
                </button>
              </div>

              {openId === v.id && mode === 'approve' && (
                <div className="rv-reject">
                  <label>Terms this video goes live on</label>
                  <p className="field-note" style={{ marginTop: -6 }}>
                    Set per video, not once for the whole platform — one artist can have a 30-day
                    premiere and another 90.
                  </p>

                  <div className="rv-presets">
                    {Object.entries(ACCESS_LABEL).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        className={`rv-preset ${terms.accessType === value ? 'on' : ''}`.trim()}
                        onClick={() => setTerms((t) => ({ ...t, accessType: value }))}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="approve-grid">
                    {terms.accessType !== 'free_with_ads' && (
                      <label>
                        Price (TZS)
                        <input
                          type="number"
                          min={0}
                          value={terms.priceTzs}
                          onChange={(e) => setTerms((t) => ({ ...t, priceTzs: e.target.value }))}
                        />
                      </label>
                    )}
                    {terms.accessType === 'paid_premiere' && (
                      <label>
                        Premiere window (days)
                        {/* 30 / 60 / 90 are the windows that get picked almost
                            every time. The field stays editable underneath, so
                            any other length is still one keystroke away. */}
                        <div className="rv-presets rv-presets-inline">
                          {[30, 60, 90].map((d) => (
                            <button
                              key={d}
                              type="button"
                              className={`rv-preset ${Number(terms.premiereDays) === d ? 'on' : ''}`.trim()}
                              onClick={() => setTerms((t) => ({ ...t, premiereDays: d }))}
                            >
                              {d} days
                            </button>
                          ))}
                        </div>
                        <input
                          type="number"
                          min={1}
                          max={3650}
                          value={terms.premiereDays}
                          onChange={(e) => setTerms((t) => ({ ...t, premiereDays: e.target.value }))}
                        />
                      </label>
                    )}
                  </div>

                  {terms.accessType === 'paid_premiere' && (
                    <p className="field-note">
                      After {terms.premiereDays || 0} days this video becomes Free + Ads, and the
                      creator earns from advertising instead of sales.
                    </p>
                  )}

                  <textarea
                    rows={2}
                    placeholder="Optional note to the creator…"
                    value={terms.note}
                    onChange={(e) => setTerms((t) => ({ ...t, note: e.target.value }))}
                  />

                  <div className="rv-reject-actions">
                    <button className="btn btn-ghost btn-sm" onClick={close}>
                      Cancel
                    </button>
                    <button className="btn btn-green btn-sm" onClick={() => approve(v)} disabled={busy}>
                      <Check />
                      {busy ? 'Publishing…' : 'Approve & Publish'}
                    </button>
                  </div>
                </div>
              )}

              {openId === v.id && mode === 'reject' && (
                <div className="rv-reject">
                  <label htmlFor={`reason-${v.id}`}>
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
                    id={`reason-${v.id}`}
                    rows={3}
                    value={reason}
                    placeholder="Explain what the creator needs to fix before resubmitting…"
                    onChange={(e) => setReason(e.target.value)}
                  />

                  <div className="rv-reject-actions">
                    <button className="btn btn-ghost btn-sm" onClick={close}>
                      Cancel
                    </button>
                    <button className="btn btn-red btn-sm" onClick={() => reject(v)} disabled={busy}>
                      <X />
                      {busy ? 'Sending…' : 'Confirm Rejection'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </Async>
      </Panel>

      <VideoPreview
        video={previewing}
        open={Boolean(previewing)}
        onClose={() => setPreviewing(null)}
      />
    </div>
  )
}

const formatDuration = (secs) => {
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
