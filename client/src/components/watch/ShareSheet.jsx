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
import api, { mediaUrl } from '@/lib/api'
import { compact, duration } from '@/hooks/useApi'
import { whatsappHref, whatsappTarget, whatsappFallback } from '@/lib/whatsappShare'
import {
  appFallback,
  copyWatchUrl,
  facebookHref,
  instagramHref,
  isTouchMobile,
  socialTarget,
  tiktokHref,
} from '@/lib/socialShare'
import { prepareShareCard, waitForShareCard } from '@/lib/warmShare'
import { canonicalWatchUrl, nativeShareData } from '@/lib/watchUrl'
import { whatsappIsPhone } from '@/lib/whatsappShare'

async function warmBeforeSend(slug, setHint, setCardReady) {
  if (!slug) return false
  setHint?.('Preparing your share card…')
  const ok = await waitForShareCard(slug, 4000)
  if (ok) {
    setCardReady?.(true)
    setHint?.('Share card ready — recipients see the poster, title and preview button.')
  } else {
    setHint?.(
      'Link is ready. If the poster does not appear right away, wait a few seconds after pasting or sending.'
    )
  }
  return ok
}


/**
 * Share sheet — client's layout and honest actions.
 *
 * WhatsApp / Facebook / Copy send the watch URL (poster card for the recipient).
 *
 * Instagram and TikTok cannot be posted into from a web page -- neither
 * accepts a shared URL, and no amount of wanting changes that. What they can
 * do is open. So those two are real links to the apps, and the 60-second clip
 * and the watch link are put in hand on the way out, which is everything the
 * person needs once they arrive. They used to only save the clip, and the
 * device answered a tap on "Instagram" with its own app picker -- reported,
 * fairly, as Instagram not opening Instagram.
 *
 * More... is the device share menu (URL only, never a file).
 */

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

export default function ShareSheet({ open, video, onClose }) {
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(null)
  const [problem, setProblem] = useState(null)
  const [hint, setHint] = useState(null)
  const [clip, setClip] = useState(null)
  /**
   * The card is a picture fetched over the network, and on Tanzanian mobile
   * data that is not instant. Until it paints there was nothing in its place,
   * so a tap on Share looked like a tap that had not registered.
   */
  const [posterOn, setPosterOn] = useState(false)
  const [cardReady, setCardReady] = useState(false)
  const [waBusy, setWaBusy] = useState(false)
  const [fbBusy, setFbBusy] = useState(false)
  const closeRef = useRef(null)
  const cardRef = useRef(null)
  const copyTimer = useRef(null)

  useLockBodyScroll(open)

  const slug = video?.slug || ''
  const url = canonicalWatchUrl(video)
  const ogCard = video ? `${window.location.origin}/og/card/${encodeURIComponent(slug)}.jpg` : ''
  /* Film frame + overlays, as in the client's mock — not the burned JPEG. */
  const still = mediaUrl(video?.thumbnailUrl)
  const posterSrc = cardReady && ogCard ? ogCard : still
  const creator = video?.creator?.name
  const verified = Boolean(video?.creator?.verified)
  const paid = Number(video?.priceTzs || 0) > 0
  const fresh =
    video?.publishedAt && Date.now() - new Date(video.publishedAt).getTime() < 1000 * 60 * 60 * 24 * 21

  useEffect(() => {
    setPosterOn(false)
  }, [posterSrc])

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    setCopied(false)
    setProblem(null)
    setHint(null)
    setSaving(null)
    setPosterOn(false)
    setCardReady(false)
    setWaBusy(false)
    setFbBusy(false)
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open || !slug) return
    let stop = false
    prepareShareCard(slug).then((ready) => {
      if (!stop) setCardReady(ready)
    })
    return () => {
      stop = true
    }
  }, [open, slug])

  useEffect(() => {
    if (!open || !slug) return
    let stop = false
    let retry = null

    /**
     * Ask once, and only ask again if the first answer was not usable.
     *
     * The retry used to be unconditional, so every open of this sheet cost two
     * calls to the same endpoint and the second returned exactly what the
     * first had. Measured on the live site: 2x GET /api/share/{slug} per open,
     * one of them for nothing. It is worth keeping for the case it was written
     * for -- a video whose promo clip is still being made -- and worth not
     * paying for every other time.
     */
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

    load()
    return () => {
      stop = true
      if (retry) clearTimeout(retry)
    }
  }, [open, slug])

  useEffect(() => () => clearTimeout(copyTimer.current), [])

  const copy = async () => {
    setProblem(null)
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setHint('Link copied. Paste in WhatsApp or Facebook — the poster card is on this link.')
      clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 2400)
      waitForShareCard(slug, 5000).then((ok) => {
        if (ok) setCardReady(true)
      })
    } catch {
      setProblem('Could not copy automatically. Long-press the link and copy it.')
    }
  }

  const shareWhatsApp = async () => {
    if (waBusy) return
    setWaBusy(true)
    setProblem(null)
    try {
      await warmBeforeSend(slug, setHint, setCardReady)
      await navigator.clipboard.writeText(url).catch(() => {})
      const href = whatsappHref(url)
      const target = whatsappTarget()
      if (target === '_self') {
        window.location.href = href
      } else {
        window.open(href, '_blank', 'noopener,noreferrer')
        if (!whatsappIsPhone()) {
          setHint(
            'WhatsApp Web is opening. Wait until the poster preview appears in the message box, then send.'
          )
        }
      }
      whatsappFallback(url)()
    } finally {
      setWaBusy(false)
    }
  }

  const shareFacebook = async () => {
    if (fbBusy) return
    setFbBusy(true)
    setProblem(null)
    try {
      await warmBeforeSend(slug, setHint, setCardReady)
      await copyWatchUrl(url)
      window.open(facebookHref(url), socialTarget(), 'noopener,noreferrer')
      setHint('Facebook is opening — the link includes the poster card preview.')
    } finally {
      setFbBusy(false)
    }
  }

  const launchSocial = (where) => {
    copyWatchUrl(url)
    waitForShareCard(slug, 2000).then((ok) => {
      if (ok) setCardReady(true)
    })
    if (!saving) void saveClip(where)
    const href = where === 'instagram' ? instagramHref() : tiktokHref()
    const fallback =
      where === 'instagram' ? 'https://www.instagram.com/' : 'https://www.tiktok.com/'
    const open = () => {
      if (isTouchMobile()) {
        window.location.href = href
        appFallback(fallback)()
      } else {
        window.open(href, '_blank', 'noopener,noreferrer')
        setHint(
          where === 'instagram'
            ? 'Instagram is opening in a new tab. The watch link is copied — paste it in your caption for the poster card.'
            : 'TikTok is opening in a new tab. The watch link is copied — paste it in your caption for the poster card.'
        )
      }
    }
    if (isTouchMobile()) window.setTimeout(open, 180)
    else open()
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
      await navigator.clipboard.writeText(url).catch(() => {})

      let fileUrl = clip?.downloadUrl ? mediaUrl(clip.downloadUrl) : null

      /**
       * Ask once, and only wait if waiting can help.
       *
       * This used to poll ten times at a second and a half whenever the clip
       * was not already in hand — fifteen seconds of spinner. When the share
       * endpoint is failing, which it can, every one of those ten calls fails
       * the same way and the person watches a button spin for a quarter of a
       * minute before being told to try again. Reported exactly that way.
       *
       * So: one call. If it answers and the clip is simply not ready yet,
       * waiting is worth something and it waits briefly. If it errors, no
       * amount of waiting will change that and it says so at once.
       */
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
          // No clip on this video yet. Start one and let them know, rather
          // than holding the button while nothing happens.
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

  const shareNative = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      if (busy) return
      setBusy(true)
      setProblem(null)
      try {
        waitForShareCard(slug, 3000).then((ok) => {
          if (ok) setCardReady(true)
        })
        await navigator.share(nativeShareData(url))
        onClose()
      } catch (err) {
        if (err?.name !== 'AbortError') {
          setProblem('Sharing was not available just now — WhatsApp or Copy link still work.')
        }
      } finally {
        setBusy(false)
      }
      return
    }
    copy()
  }

  const previewCard = () => {
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    if (ogCard) window.open(ogCard, '_blank', 'noopener,noreferrer')
  }

  if (!open || !video) return null

  return createPortal(
    <div className="modal open share-modal" role="dialog" aria-modal="true" aria-labelledby="share-title">
      <div className="modal-bg" onClick={onClose} />
      <div className="modal-card share-card">
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
          {cardReady ? (
            <span className="share-ready-pill">Card ready</span>
          ) : (
            <span className="share-ready-pill is-wait">Preparing card…</span>
          )}
        </p>

        <div className="share-og" ref={cardRef}>
          <div className="share-og-stage">
            {posterSrc ? (
              <>
                {!posterOn && <span className="share-og-loading" aria-hidden="true" />}
                <img
                  src={posterSrc}
                  alt=""
                  decoding="async"
                  className={posterOn ? 'is-on' : ''}
                  onLoad={() => setPosterOn(true)}
                  onError={() => setPosterOn(true)}
                />
              </>
            ) : (
              <span className="share-thumb-blank" aria-hidden="true">
                <Film size={28} />
              </span>
            )}
            <span className="share-og-veil" aria-hidden="true" />
            <span className="share-og-badge">MTONYO+</span>
            {video.durationSeconds > 0 && (
              <span className="share-og-time">{duration(video.durationSeconds)}</span>
            )}
            <span className="share-og-play" aria-hidden="true">
              <Play size={22} fill="currentColor" />
            </span>
            <div className="share-og-meta">
              {fresh && <span className="share-og-new">New release</span>}
              <b>{video.title}</b>
              {creator && (
                <small>
                  {creator}
                  {verified && <BadgeCheck size={13} />}
                </small>
              )}
              <em>Watch free preview</em>
            </div>
            <div className="share-og-stats">
              {video.views != null && (
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

        <button className="share-wa" type="button" onClick={shareWhatsApp} disabled={waBusy}>
          {waBusy ? <Loader2 size={26} className="spin" /> : <IconWhatsApp size={26} />}
          <span className="share-wa-copy">
            <b>{waBusy ? 'Preparing card…' : 'Share on WhatsApp'}</b>
            <small>
              {waBusy ? 'Building poster preview for this link' : 'Share privately or in groups'}
            </small>
          </span>
        </button>

        <div className="share-targets">
          <button
            className="share-target is-ig"
            type="button"
            onClick={() => launchSocial('instagram')}
            disabled={saving === 'instagram'}
          >
            {saving === 'instagram' ? <Loader2 size={22} className="spin" /> : <IconInstagram />}
            <b>Instagram</b>
            <small>Clip + link card</small>
          </button>
          <button
            className="share-target is-tt"
            type="button"
            onClick={() => launchSocial('tiktok')}
            disabled={saving === 'tiktok'}
          >
            {saving === 'tiktok' ? <Loader2 size={22} className="spin" /> : <IconTikTok />}
            <b>TikTok</b>
            <small>Clip + link card</small>
          </button>
          <button
            className="share-target is-fb"
            type="button"
            onClick={shareFacebook}
            disabled={fbBusy}
          >
            {fbBusy ? <Loader2 size={22} className="spin" /> : <IconFacebook />}
            <b>Facebook</b>
            <small>{fbBusy ? 'Preparing…' : 'Share to Feed'}</small>
          </button>
          <button className="share-target is-copy" type="button" onClick={copy}>
            {copied ? <Check size={22} /> : <IconLink />}
            <b>{copied ? 'Copied' : 'Copy link'}</b>
            <small>Get shareable link</small>
          </button>
        </div>

        <button className="share-row" type="button" onClick={shareNative} disabled={busy}>
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
          disabled={Boolean(saving)}
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
