import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy, Download, Facebook, Film, Loader2, MessageCircle, Share2, X } from 'lucide-react'
import useLockBodyScroll from '@/hooks/useLockBodyScroll'
import api from '@/lib/api'
import { whatsappShare } from '@/lib/whatsappShare'

/**
 * Share the watch URL so WhatsApp / Facebook / X can draw the Open Graph card.
 *
 * The previous sheet called `navigator.share({ title, text, url })`. On iPhone
 * and iPad that lands in WhatsApp as a caption —
 * "Behind The Fame by Asha Mwinyi. Watch the free preview on MTONYO+." — plus
 * a tiny webpage icon. WhatsApp then never fetches the per-video poster.
 *
 * The card a recipient actually sees is built from the watch page's OG tags
 * (title, creator, 1200×630 poster). Extra text in the share payload kills it.
 * Every target below sends the URL alone.
 */
export default function ShareSheet({ open, video, onClose }) {
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState(null)
  const [clip, setClip] = useState(null)
  const closeRef = useRef(null)
  const copyTimer = useRef(null)

  useLockBodyScroll(open)

  const slug = video?.slug || video?.id || ''
  const url = video ? `${window.location.origin}/watch/${slug}` : ''
  const poster = video ? `${window.location.origin}/og/card/${encodeURIComponent(slug)}.jpg` : ''
  const creator = video?.creator?.name

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    setCopied(false)
    setProblem(null)
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open || !slug) return
    let stop = false
    const load = () =>
      api.share
        .payload(slug)
        .then((body) => {
          if (!stop) setClip(body?.clip || null)
        })
        .catch(() => {
          if (!stop) setClip(null)
        })
    load()
    const retry = setTimeout(load, 4000)
    return () => {
      stop = true
      clearTimeout(retry)
    }
  }, [open, slug])

  useEffect(() => () => clearTimeout(copyTimer.current), [])

  const copy = async () => {
    setProblem(null)
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 2400)
    } catch {
      setProblem('Could not copy automatically. Tap the link above and copy it.')
    }
  }

  const shareNative = async () => {
    if (busy) return
    setBusy(true)
    setProblem(null)
    try {
      await navigator.share({ url })
      onClose()
    } catch (err) {
      if (err?.name !== 'AbortError') {
        setProblem('Sharing was not available just now — WhatsApp or Copy link still work.')
      }
    } finally {
      setBusy(false)
    }
  }

  if (!open || !video) return null

  const canNative = typeof navigator !== 'undefined' && Boolean(navigator.share)
  const wa = whatsappShare(url)

  return createPortal(
    <div className="modal open share-modal" role="dialog" aria-modal="true" aria-labelledby="share-title">
      <div className="modal-bg" onClick={onClose} />
      <div className="modal-card share-card">
        <button className="modal-x" onClick={onClose} aria-label="Close" ref={closeRef}>
          <X />
        </button>

        <h3 id="share-title">Share this video</h3>
        <p className="share-sub">
          This is the card they will see. They tap it, watch the free preview, then pay to continue.
        </p>

        <div className="share-og">
          <div className="share-og-poster">
            {poster ? (
              <img src={poster} alt="" loading="lazy" decoding="async" />
            ) : (
              <span className="share-thumb-blank" aria-hidden="true">
                <Film size={28} />
              </span>
            )}
          </div>
          <div className="share-og-body">
            <span className="share-og-brand">MTONYO+</span>
            <b>{video.title}</b>
            {creator && <small>{creator}</small>}
            <em>WATCH FREE PREVIEW</em>
          </div>
        </div>

        <label className="share-link-label" htmlFor="share-link">
          The link they will open
        </label>
        <input
          id="share-link"
          className="share-link"
          value={url}
          readOnly
          onFocus={(e) => e.target.select()}
        />

        {problem && (
          <p className="share-problem" role="status">
            {problem}
          </p>
        )}

        <a
          className="btn btn-block share-wa"
          href={wa.href}
          target={wa.target}
          rel="noopener noreferrer"
        >
          <MessageCircle />
          WhatsApp
        </a>

        <div className="share-targets">
          <a
            className="share-target"
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Facebook size={18} />
            Facebook
          </a>
          <a
            className="share-target"
            href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="share-x" aria-hidden="true">X</span>
            X
          </a>
          <button className="share-target" type="button" onClick={copy}>
            {copied ? <Check size={18} /> : <Copy size={18} />}
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>

        {canNative && (
          <button className="btn btn-ghost btn-block" type="button" onClick={shareNative} disabled={busy}>
            {busy ? <Loader2 className="spin" /> : <Share2 />}
            {busy ? 'Opening share…' : 'More…'}
          </button>
        )}

        {clip?.downloadUrl && (
          <a
            className="btn btn-ghost btn-block"
            href={clip.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Download />
            {clip.downloadReady ? 'Save 60s clip' : 'Prepare 60s clip'}
          </a>
        )}

        <p className="share-note">
          WhatsApp, Facebook and X get the card above. The 60-second clip is for Instagram
          and TikTok — save it, then post it there.
        </p>
      </div>
    </div>,
    document.body
  )
}
