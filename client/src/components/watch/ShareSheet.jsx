import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  BadgeCheck,
  Check,
  ChevronRight,
  Eye,
  Film,
  Loader2,
  Lock,
  Play,
  Shield,
  X,
} from 'lucide-react'
import {
  IconFacebook,
  IconInstagram,
  IconTikTok,
  IconWhatsApp,
} from '@/components/ui/SocialIcons'
import useLockBodyScroll from '@/hooks/useLockBodyScroll'
import { useNotify } from '@/context/ToastContext'
import api, { mediaUrl } from '@/lib/api'
import { compact, duration } from '@/hooks/useApi'
import {
  appFallback,
  copyWatchUrl,
  instagramHref,
  isTouchMobile,
  tiktokHref,
} from '@/lib/socialShare'
import { warmShare, healShareCard } from '@/lib/warmShare'
import { urlsFromShare } from '@/lib/shareUrls'
import { nativeShareData } from '@/lib/watchUrl'
import { idle, cancelIdle } from '@/lib/mobileUx'

function isMobileUa() {
  return /Android|iPhone|iPad|iPod/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '')
}

function IconLink({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10.7 5.24" />
      <path d="M14 11a5 5 0 0 0-7.07 0L5.52 12.4a5 5 0 0 0 7.07 7.07l1.72-1.72" />
    </svg>
  )
}

function IconShareNodes({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 13.5 15.4 17.5M15.4 6.5 8.6 10.5" />
    </svg>
  )
}

function IconClapper({ size = 22 }) {
  return (
    <span className="share-clip-ic" aria-hidden="true">
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 11h16v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9z" />
        <path d="m4 11 2.5-7h3L8 11M12 4h3l-1.5 7H10.5M18 4h2.5L19 11h-3.5" />
      </svg>
      <em>60s</em>
    </span>
  )
}

export default function ShareSheet({ open, video, share, onClose }) {
  const notify = useNotify()
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(null)
  const [problem, setProblem] = useState(null)
  const [hint, setHint] = useState(null)
  const [clip, setClip] = useState(null)
  const [posterOn, setPosterOn] = useState(false)
  const [cardFailed, setCardFailed] = useState(false)
  const closeRef = useRef(null)
  const cardRef = useRef(null)
  const copyTimer = useRef(null)
  const touchStartY = useRef(null)

  useLockBodyScroll(open, { delay: true })

  const { shareUrl, cleanUrl, cardUrl } = urlsFromShare(video, share)
  const slug = video?.slug || share?.slug || ''
  const still = mediaUrl(video?.thumbnailUrl)
  /** Server JPEG already has title, play, badge — no CSS overlays on top. */
  const usingComposedCard = Boolean(cardUrl && !cardFailed)
  const posterSrc = usingComposedCard ? cardUrl : still
  const creator = video?.creator?.name || share?.creator
  const verified = Boolean(video?.creator?.verified)
  const paid = Number(video?.priceTzs || 0) > 0
  const fresh =
    video?.publishedAt && Date.now() - new Date(video.publishedAt).getTime() < 1000 * 60 * 60 * 24 * 21

  const warm = () => {
    if (shareUrl) warmShare({ shareUrl, cleanUrl, cardUrl })
  }

  useEffect(() => {
    setCardFailed(false)
    setPosterOn(false)
  }, [posterSrc, cardUrl, open])

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
    if (!open) return
    const warmId = idle(() => {
      if (shareUrl) warmShare({ shareUrl, cleanUrl, cardUrl })
      if (share?.cardStatus && share.cardStatus !== 'ready' && slug) {
        healShareCard(slug)
      }
    })
    return () => cancelIdle(warmId)
  }, [open, shareUrl, cleanUrl, cardUrl, share?.cardStatus, slug])

  useEffect(() => {
    if (!open || !slug) return
    let stop = false
    let retry = null
    const load = () =>
      api.share
        .payload(slug)
        .then((body) => {
          if (stop) return
          setClip(body?.clip || null)
          if (!body?.clip && !retry) retry = setTimeout(load, 4000)
        })
        .catch(() => {
          if (stop) return
          setClip(null)
          if (!retry) retry = setTimeout(load, 4000)
        })

    const idleId = idle(load)
    return () => {
      stop = true
      cancelIdle(idleId)
      if (retry) clearTimeout(retry)
    }
  }, [open, slug])

  useEffect(() => () => clearTimeout(copyTimer.current), [])

  const onWhatsApp = () => {
    const text = shareUrl
    const mobile = isMobileUa()
    const href = mobile
      ? `whatsapp://send?text=${encodeURIComponent(text)}`
      : `https://web.whatsapp.com/send?text=${encodeURIComponent(text)}`
    if (mobile) {
      window.location.href = href
      setTimeout(() => {
        if (!document.hidden) {
          window.location.href = `https://wa.me/?text=${encodeURIComponent(text)}`
        }
      }, 1200)
    } else {
      window.open(href, '_blank', 'noopener,noreferrer')
    }
    warm()
  }

  const onFacebook = () => {
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
      '_blank',
      'noopener,noreferrer'
    )
    warm()
  }

  const onCopy = () => {
    setProblem(null)
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => {
        setCopied(true)
        notify.success('Link copied')
        clearTimeout(copyTimer.current)
        copyTimer.current = setTimeout(() => setCopied(false), 2400)
      })
      .catch(() => {
        setProblem('Could not copy automatically. Long-press the link and copy it.')
        notify.error('Could not copy — select the link below', {
          retry: () => onCopy(),
        })
      })
    if (shareUrl) warmShare({ shareUrl, cleanUrl, cardUrl })
  }

  const launchSocial = (where) => {
    copyWatchUrl(shareUrl)
    if (!saving) void saveClip(where)
    const href = where === 'instagram' ? instagramHref() : tiktokHref()
    const fallback =
      where === 'instagram' ? 'https://www.instagram.com/' : 'https://www.tiktok.com/'
    if (isTouchMobile()) {
      window.location.href = href
      appFallback(fallback)()
    } else {
      window.open(href, '_blank', 'noopener,noreferrer')
    }
    warm()
  }

  const saveClip = async (where) => {
    if (saving) return
    setProblem(null)
    setHint(null)
    setSaving(where)

    const caption =
      where === 'instagram'
        ? 'Opening Instagram. The 60s clip is saved and the watch link is copied — paste it in your caption or story link sticker for the poster card.'
        : where === 'tiktok'
          ? 'Opening TikTok. The 60s clip is saved and the watch link is copied — paste it in your caption for the poster card.'
          : '60-second clip saved. Use it on WhatsApp Status, Reels, TikTok and Stories.'

    const downloadFile = async (fileUrl) => {
      const r = await fetch(fileUrl, { mode: 'cors', credentials: 'omit' })
      if (!r.ok) throw new Error('clip')
      const blob = await r.blob()
      if (blob.size < 1000) throw new Error('clip')
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = `${slug || 'promo'}-promo.mp4`
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 8000)
    }

    try {
      await navigator.clipboard.writeText(shareUrl).catch(() => {})

      let fileUrl = clip?.downloadUrl ? mediaUrl(clip.downloadUrl) : null

      if (!fileUrl) {
        let body = null
        let failed = false
        try {
          body = await api.share.payload(slug)
        } catch {
          failed = true
        }

        if (failed) {
          setProblem(
            'The clip could not be fetched just now. The watch link is copied — you can paste it anywhere.'
          )
          return
        }

        if (body?.clip?.downloadUrl) {
          setClip(body.clip)
          fileUrl = mediaUrl(body.clip.downloadUrl)
        } else {
          setHint('Preparing the 60-second clip — try again shortly. The watch link is copied.')
          api.share.generate(slug).catch(() => {})
          return
        }
      }

      if (!fileUrl) {
        setHint('Watch link copied for the caption. Tap again in a moment to save the 60s clip.')
        return
      }

      try {
        await downloadFile(fileUrl)
      } catch {
        window.open(fileUrl, '_blank', 'noopener,noreferrer')
      }
      setHint(caption)
    } catch {
      setProblem('Could not save the clip. Check your connection and try again — the watch link is copied.')
    } finally {
      setSaving(null)
    }
  }

  const onNativeShare = () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      if (busy) return
      setBusy(true)
      navigator
        .share(nativeShareData(shareUrl, video?.title))
        .then(() => onClose())
        .catch((err) => {
          if (err?.name !== 'AbortError') {
            setProblem('Sharing was not available just now — WhatsApp or Copy link still work.')
          }
        })
        .finally(() => setBusy(false))
      warm()
      return
    }
    onCopy()
  }

  const previewCard = () => {
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    if (cardUrl) window.open(cardUrl, '_blank', 'noopener,noreferrer')
  }

  if (!open) return null

  const title = video?.title || share?.title || 'Share this video'
  const cardReady = share?.cardStatus === 'ready' || usingComposedCard

  return createPortal(
    <div className="modal open share-modal" role="dialog" aria-modal="true" aria-labelledby="share-title">
      <div className="modal-bg" onClick={onClose} />
      <div
        className="modal-card share-card"
        onTouchStart={(e) => {
          touchStartY.current = e.touches[0]?.clientY ?? null
        }}
        onTouchEnd={(e) => {
          const start = touchStartY.current
          const end = e.changedTouches[0]?.clientY
          if (start != null && end != null && end - start > 72) onClose()
          touchStartY.current = null
        }}
      >
        <button className="modal-x share-xbtn" onClick={onClose} aria-label="Close" ref={closeRef}>
          <X />
        </button>

        <h3 id="share-title">Share this video</h3>
        <p className="share-sub">
          Help people discover this amazing content. They watch the free preview, then <b>pay</b> to
          continue.
        </p>

        <p className="share-kicker">
          <Eye size={14} />
          This is what your audience will see
          <span className={`share-ready-pill${cardReady ? '' : ' is-wait'}`.trim()}>
            {cardReady ? 'Card ready' : 'Loading card…'}
          </span>
        </p>

        <div className="share-og" ref={cardRef}>
          <div className={`share-og-stage${usingComposedCard ? ' is-composed' : ''}`}>
            {posterSrc ? (
              <>
                {!posterOn && <span className="share-og-loading" aria-hidden="true" />}
                <img
                  src={posterSrc}
                  alt=""
                  width={1200}
                  height={630}
                  decoding="async"
                  fetchPriority="high"
                  className={posterOn ? 'is-on' : ''}
                  onLoad={() => setPosterOn(true)}
                  onError={() => {
                    if (usingComposedCard) setCardFailed(true)
                    setPosterOn(true)
                  }}
                />
              </>
            ) : (
              <span className="share-thumb-blank" aria-hidden="true">
                <Film size={28} />
              </span>
            )}
            {!usingComposedCard && (
              <>
                <span className="share-og-veil" aria-hidden="true" />
                <span className="share-og-badge">MTONYO+</span>
                {video?.durationSeconds > 0 && (
                  <span className="share-og-time">{duration(video.durationSeconds)}</span>
                )}
                <span className="share-og-play" aria-hidden="true">
                  <Play size={22} fill="currentColor" />
                </span>
                <div className="share-og-meta">
                  {fresh && <span className="share-og-new">New release</span>}
                  <b>{title}</b>
                  {creator && (
                    <small>
                      {creator}
                      {verified && <BadgeCheck size={13} />}
                    </small>
                  )}
                  <em>Watch free preview</em>
                </div>
                <div className="share-og-stats">
                  {video?.views != null && (
                    <span>
                      <Eye size={12} />
                      {compact(video.views)} views
                    </span>
                  )}
                  {paid && (
                    <span>
                      <Lock size={12} />
                      Pay to continue
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {problem && (
          <>
            <p className="share-problem" role="status">
              {problem}
            </p>
            <input
              className="share-link"
              value={shareUrl}
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

        <button className="share-wa" type="button" onClick={onWhatsApp}>
          <IconWhatsApp size={26} />
          <span className="share-wa-copy">
            <b>Share on WhatsApp</b>
            <small>Share privately or in groups</small>
          </span>
        </button>

        <div className="share-targets">
          <button
            className="share-target is-ig"
            type="button"
            onClick={() => launchSocial('instagram')}
          >
            {saving === 'instagram' ? <Loader2 size={22} className="spin" /> : <IconInstagram />}
            <b>Instagram</b>
            <small>Clip + link card</small>
          </button>
          <button
            className="share-target is-tt"
            type="button"
            onClick={() => launchSocial('tiktok')}
          >
            {saving === 'tiktok' ? <Loader2 size={22} className="spin" /> : <IconTikTok />}
            <b>TikTok</b>
            <small>Clip + link card</small>
          </button>
          <button className="share-target is-fb" type="button" onClick={onFacebook}>
            <IconFacebook />
            <b>Facebook</b>
            <small>Share to Feed</small>
          </button>
          <button className="share-target is-copy" type="button" onClick={onCopy}>
            {copied ? <Check size={22} /> : <IconLink />}
            <b>{copied ? 'Copied' : 'Copy link'}</b>
            <small>Get shareable link</small>
          </button>
        </div>

        <button className="share-row" type="button" onClick={onNativeShare} disabled={busy}>
          {busy ? <Loader2 className="spin" size={20} /> : <IconShareNodes />}
          <span>
            <b>More apps</b>
            <small>Share via other apps on your device</small>
          </span>
          <ChevronRight size={16} className="share-row-go" />
        </button>

        <button
          className="share-row"
          type="button"
          onClick={() => saveClip('save')}
        >
          {saving === 'save' ? <Loader2 className="spin" size={20} /> : <IconClapper />}
          <span>
            <b>
              Save 60s promo clip
              <em className="share-pill">Perfect for promotion</em>
            </b>
            <small>Use for WhatsApp Status, Reels, TikTok &amp; Stories</small>
          </span>
          <ChevronRight size={16} className="share-row-go" />
        </button>

        <div className="share-foot">
          <p className="share-trust">
            <Shield size={16} />
            <span>
              <b>Safe · Secure · Trusted</b>
              <small>Your content and earnings are protected.</small>
            </span>
          </p>
          <button className="share-preview" type="button" onClick={previewCard}>
            <Eye size={15} />
            Preview share card
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
