import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy, Film, Loader2, Share2, X } from 'lucide-react'
import api, { mediaUrl } from '@/lib/api'
import useLockBodyScroll from '@/hooks/useLockBodyScroll'

/**
 * Sharing a video, as a screen rather than a silent action.
 *
 * The share button used to call `navigator.share` straight away. That works on
 * a phone and does almost nothing visible on a desktop, where the browser has
 * no share sheet — the link went to the clipboard and a toast said so, which is
 * the whole feedback a person got for the platform's main growth loop.
 *
 * This shows what is actually being shared before sending it: the poster, the
 * title, and the exact link the recipient will open. The behaviour underneath
 * is unchanged — the same deep link, the same 60-second clip attached through
 * Web Share Level 2 where the browser supports files, the same fallback to the
 * clipboard where it does not.
 */
export default function ShareSheet({ open, video, onClose }) {
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState(null)
  const closeRef = useRef(null)
  const copyTimer = useRef(null)

  useLockBodyScroll(open)

  const url = video ? `${window.location.origin}/watch/${video.slug || video.id}` : ''
  const text = video ? `Watch "${video.title}" on MTONYO+` : ''

  /* Move focus into the dialog so a keyboard is not left behind the overlay. */
  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    setCopied(false)
    setProblem(null)
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => () => clearTimeout(copyTimer.current), [])

  const copy = async () => {
    setProblem(null)
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 2400)
    } catch {
      // Clipboard access can be refused outright — offer the link to select
      // rather than telling somebody their browser said no.
      setProblem('Could not copy automatically. Tap the link above and copy it.')
    }
  }

  /**
   * The OS share sheet, carrying the clip itself where the browser allows it.
   * Instagram and TikTok have no web publishing API, so a real file handed to
   * the device is the only route to them that exists.
   */
  const shareNative = async () => {
    if (busy) return
    setBusy(true)
    setProblem(null)
    try {
      let file = null
      try {
        const payload = await api.share.payload(video.slug || video.id)
        const clipUrl = payload?.clip?.downloadUrl
        if (clipUrl && navigator.canShare) {
          const res = await fetch(clipUrl)
          if (res.ok) {
            const blob = await res.blob()
            const candidate = new File([blob], `${(video.slug || 'mtonyo').slice(0, 40)}.mp4`, {
              type: blob.type || 'video/mp4',
            })
            if (navigator.canShare({ files: [candidate] })) file = candidate
          }
        }
      } catch {
        /* The clip is the bonus. The link is the guarantee. */
      }

      await navigator.share(
        file ? { files: [file], title: video.title, text, url } : { title: video.title, text, url }
      )
      onClose()
    } catch (err) {
      // Dismissing the OS sheet is a choice, not a failure.
      if (err?.name !== 'AbortError') {
        setProblem('Sharing was not available just now — the link below still works.')
      }
    } finally {
      setBusy(false)
    }
  }

  if (!open || !video) return null

  const canNative = typeof navigator !== 'undefined' && Boolean(navigator.share)

  return createPortal(
    <div className="modal open" role="dialog" aria-modal="true" aria-labelledby="share-title">
      <div className="modal-bg" onClick={onClose} />
      <div className="modal-card share-card">
        <button className="modal-x" onClick={onClose} aria-label="Close" ref={closeRef}>
          <X />
        </button>

        <h3 id="share-title">Share this video</h3>

        {/* What is actually going out — seen before it is sent. */}
        <div className="share-preview">
          {video.thumbnailUrl ? (
            <img src={mediaUrl(video.thumbnailUrl)} alt="" loading="lazy" decoding="async" />
          ) : (
            <span className="share-thumb-blank" aria-hidden="true">
              <Film size={20} />
            </span>
          )}
          <div>
            <b>{video.title}</b>
            {video.creator?.name && <small>{video.creator.name}</small>}
          </div>
        </div>

        <label className="share-link-label" htmlFor="share-link">
          The link they will open
        </label>
        <input id="share-link" className="share-link" value={url} readOnly onFocus={(e) => e.target.select()} />

        {problem && (
          <p className="share-problem" role="status">
            {problem}
          </p>
        )}

        {canNative && (
          <button className="btn btn-gold btn-block" onClick={shareNative} disabled={busy}>
            {busy ? <Loader2 className="spin" /> : <Share2 />}
            {busy ? 'Preparing the clip…' : 'Share'}
          </button>
        )}

        <button className="btn btn-ghost btn-block" onClick={copy}>
          {copied ? <Check /> : <Copy />}
          {copied ? 'Link copied' : 'Copy link'}
        </button>

        <p className="share-note">
          Whoever opens it lands on this video, ready to watch the free preview — not on the
          homepage.
        </p>
      </div>
    </div>,
    document.body
  )
}
