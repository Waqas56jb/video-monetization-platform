import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Flag, X } from 'lucide-react'
import api from '@/lib/api'
import useLockBodyScroll from '@/hooks/useLockBodyScroll'

/**
 * Reporting a video.
 *
 * The Copyright & Reporting policy told people to write to an email address,
 * and that was the whole mechanism — nothing connected it to the moderation
 * queue staff actually work from, so a claim depended on somebody remembering
 * to forward it.
 *
 * Deliberately usable signed out. Requiring an account to report infringement
 * protects nobody except the person infringing, and the one most likely to find
 * their own film here is a rights holder who has never used the platform.
 */
const REASONS = [
  { value: 'copyright', label: 'It is my work, or I represent the rights holder' },
  { value: 'inappropriate', label: 'Explicit, hateful or otherwise against the rules' },
  { value: 'misleading', label: 'Not what the page said it was' },
  { value: 'illegal', label: 'Illegal content' },
  { value: 'other', label: 'Something else' },
]

export default function ReportDialog({ open, video, signedIn, onClose }) {
  const [reason, setReason] = useState('')
  const [detail, setDetail] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  const [error, setError] = useState(null)
  const closeRef = useRef(null)

  useLockBodyScroll(open)

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    setReason('')
    setDetail('')
    setEmail('')
    setDone(null)
    setError(null)
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const send = async (e) => {
    e.preventDefault()
    if (!reason) return setError('Choose what is wrong with it')
    setBusy(true)
    setError(null)
    try {
      const res = await api.videos.report(video.slug || video.id, {
        reason,
        detail: detail.trim() || undefined,
        email: email.trim() || undefined,
      })
      setDone(res.message || 'Thank you — our moderation team will review this.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!open || !video) return null

  return createPortal(
    <div className="modal open" role="dialog" aria-modal="true" aria-labelledby="report-title">
      <div className="modal-bg" onClick={onClose} />
      <div className="modal-card report-card">
        <button className="modal-x" onClick={onClose} aria-label="Close" ref={closeRef}>
          <X />
        </button>

        {done ? (
          <div className="report-done">
            <span className="pay-ic good">
              <Flag />
            </span>
            <h3>Report received</h3>
            <p className="pay-sub">{done}</p>
            <button className="btn btn-gold btn-block" onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={send} noValidate>
            <h3 id="report-title">Report this video</h3>
            <p className="report-sub">
              A member of the MTONYO+ team reads every report. Tell us what is wrong and we will
              look at it.
            </p>

            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}

            <fieldset className="report-reasons">
              <legend>What is wrong with it?</legend>
              {REASONS.map((r) => (
                <label key={r.value} className={reason === r.value ? 'on' : ''}>
                  <input
                    type="radio"
                    name="report-reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => {
                      setReason(r.value)
                      setError(null)
                    }}
                  />
                  <span>{r.label}</span>
                </label>
              ))}
            </fieldset>

            <label className="report-label" htmlFor="report-detail">
              Anything else we should know? <span>Optional</span>
            </label>
            <textarea
              id="report-detail"
              rows={3}
              value={detail}
              maxLength={1500}
              placeholder="For a copyright claim, tell us what work this infringes and your authority to act for the rights holder."
              onChange={(e) => setDetail(e.target.value)}
            />

            {/* Somebody not signed in still needs to be reachable about it. */}
            {!signedIn && (
              <>
                <label className="report-label" htmlFor="report-email">
                  Your email <span>Optional — so we can come back to you</span>
                </label>
                <input
                  id="report-email"
                  type="email"
                  className="share-link"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                />
              </>
            )}

            <button className="btn btn-gold btn-block" type="submit" disabled={busy}>
              <Flag />
              {busy ? 'Sending…' : 'Send report'}
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body
  )
}
