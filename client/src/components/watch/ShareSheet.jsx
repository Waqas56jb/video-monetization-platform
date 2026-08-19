import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Check,
  ChevronRight,
  Clapperboard,
  Eye,
  Facebook,
  Film,
  Instagram,
  Link2,
  Loader2,
  MessageCircle,
  Play,
  Share2,
  X,
} from 'lucide-react'
import useLockBodyScroll from '@/hooks/useLockBodyScroll'
import api from '@/lib/api'
import { openWhatsApp } from '@/lib/whatsappShare'

/**
 * Share the watch URL so WhatsApp / Facebook can draw the Open Graph card.
 *
 * Layout follows the client's mock: WhatsApp is the main action; Instagram and
 * TikTok save the 60s clip (no web publish API); Facebook shares the link;
 * More… is the device sheet; Copy link stays. Every link target sends the URL
 * alone — extra caption text makes WhatsApp skip the poster card.
 */
function TikTokMark({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M14.2 3.2c.5 2.6 2.1 4.7 4.6 5.5v2.5a8 8 0 0 1-4.6-1.3v7.4c0 3.6-2.9 6.5-6.5 6.5S1.2 20.9 1.2 17.3s2.9-6.5 6.5-6.5c.5 0 1 .1 1.4.2v2.7a3.8 3.8 0 0 0-1.4-.3 3.8 3.8 0 1 0 3.8 3.9V3.2h2.7z" />
    </svg>
  )
}

export default function ShareSheet({ open, video, onClose }) {
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(null)
  const [problem, setProblem] = useState(null)
  const [hint, setHint] = useState(null)
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
    setHint(null)
    setSaving(null)
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
      setHint('Link copied. Paste it anywhere.')
      clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 2400)
    } catch {
      setProblem('Could not copy automatically. Long-press the link and copy it.')
    }
  }

  const saveClip = async (where) => {
    if (saving) return
    setProblem(null)
    setHint(null)

    if (!clip?.downloadUrl) {
      setHint('The 60-second clip is still being prepared. Try again in a moment.')
      api.share
        .payload(slug)
        .then((body) => setClip(body?.clip || null))
        .catch(() => {})
      return
    }

    setSaving(where)
    try {
      await navigator.clipboard.writeText(url).catch(() => {})
      const a = document.createElement('a')
      a.href = clip.downloadUrl
      a.download = `${slug}-promo.mp4`
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      document.body.appendChild(a)
      a.click()
      a.remove()

      if (where === 'instagram') {
        setHint('Clip ready. Open Instagram and post it to Feed, Story or Reel. The watch link is copied for the caption.')
      } else if (where === 'tiktok') {
        setHint('Clip ready. Open TikTok and upload it. The watch link is copied for the caption.')
      } else {
        setHint('60-second clip saved. Use it on WhatsApp Status, Reels, TikTok and Stories.')
      }
    } catch {
      setProblem('Could not start the clip download. Check your connection and try again.')
    } finally {
      setSaving(null)
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

  return createPortal(
    <div className="modal open share-modal" role="dialog" aria-modal="true" aria-labelledby="share-title">
      <div className="modal-bg" onClick={onClose} />
      <div className="modal-card share-card">
        <button className="modal-x" onClick={onClose} aria-label="Close" ref={closeRef}>
          <X />
        </button>

        <h3 id="share-title">Share this video</h3>
        <p className="share-sub">
          They watch the free preview, then pay to continue.
        </p>

        <p className="share-kicker">
          <Eye size={13} />
          This is what they will see
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
            <span className="share-og-play" aria-hidden="true">
              <Play size={18} fill="currentColor" />
            </span>
          </div>
          <div className="share-og-body">
            <span className="share-og-brand">MTONYO+</span>
            <b>{video.title}</b>
            {creator && <small>{creator}</small>}
            <em>WATCH FREE PREVIEW</em>
          </div>
        </div>

        {problem && (
          <>
            <p className="share-problem" role="status">
              {problem}
            </p>
            <input
              className="share-link"
              value={url}
              readOnly
              onFocus={(e) => e.target.select()}
              aria-label="Share link"
            />
          </>
        )}
        {hint && (
          <p className="share-hint" role="status">
            {hint}
          </p>
        )}

        <button
          className="btn btn-block share-wa"
          type="button"
          onClick={() => openWhatsApp(url)}
        >
          <MessageCircle />
          <span className="share-wa-copy">
            <b>Share on WhatsApp</b>
            <small>Share privately or in groups</small>
          </span>
        </button>

        <div className="share-targets">
          <button className="share-target is-ig" type="button" onClick={() => saveClip('instagram')}>
            {saving === 'instagram' ? <Loader2 size={20} className="spin" /> : <Instagram size={20} />}
            <b>Instagram</b>
            <small>Feed, Reels, Story</small>
          </button>
          <button className="share-target is-tt" type="button" onClick={() => saveClip('tiktok')}>
            {saving === 'tiktok' ? <Loader2 size={20} className="spin" /> : <TikTokMark />}
            <b>TikTok</b>
            <small>Post clip</small>
          </button>
          <a
            className="share-target is-fb"
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Facebook size={20} />
            <b>Facebook</b>
            <small>Share to Feed</small>
          </a>
          <button className="share-target" type="button" onClick={copy}>
            {copied ? <Check size={20} /> : <Link2 size={20} />}
            <b>{copied ? 'Copied' : 'Copy link'}</b>
            <small>Get shareable link</small>
          </button>
        </div>

        {canNative && (
          <button className="share-row" type="button" onClick={shareNative} disabled={busy}>
            {busy ? <Loader2 className="spin" size={18} /> : <Share2 size={18} />}
            <span>
              <b>More…</b>
              <small>Share via other apps on your device</small>
            </span>
            <ChevronRight size={16} className="share-row-go" />
          </button>
        )}

        <button
          className="share-row"
          type="button"
          onClick={() => saveClip('save')}
          disabled={Boolean(saving)}
        >
          {saving === 'save' ? <Loader2 className="spin" size={18} /> : <Clapperboard size={18} />}
          <span>
            <b>
              {clip?.downloadUrl ? 'Save 60s promo clip' : 'Prepare 60s promo clip'}
              <em className="share-pill">For promotion</em>
            </b>
            <small>Use for WhatsApp Status, Reels, TikTok and Stories</small>
          </span>
          <ChevronRight size={16} className="share-row-go" />
        </button>
      </div>
    </div>,
    document.body
  )
}
