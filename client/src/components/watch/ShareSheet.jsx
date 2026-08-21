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
import useLockBodyScroll from '@/hooks/useLockBodyScroll'
import api, { mediaUrl } from '@/lib/api'
import { compact, duration } from '@/hooks/useApi'
import { whatsappHref, whatsappTarget, whatsappFallback } from '@/lib/whatsappShare'
import { facebookHref, socialTarget } from '@/lib/socialShare'

/**
 * Share sheet — layout, icons and type match the client's mock.
 *
 * WhatsApp and Facebook can be opened with this watch URL. Instagram and
 * TikTok have no web share that lands in their composer — those buttons
 * would only open the OS picker, so they are not shown as direct-app shares.
 * Recipients get a poster card (title, creator, MTONYO+). The free preview
 * plays on MTONYO+ after they tap, not inside WhatsApp.
 */

function IconWhatsApp({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.4-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.14-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.48.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35zM12.05 21.79h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26C2.16 5.34 6.59.9 12.05.9a9.82 9.82 0 0 1 6.99 2.9 9.83 9.83 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88zm8.41-18.3A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L0 24l6.3-1.65a11.88 11.88 0 0 0 5.74 1.46h.01c6.55 0 11.89-5.34 11.89-11.89 0-3.18-1.24-6.16-3.48-8.41z" />
    </svg>
  )
}

function IconFacebook({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M22.68 12.07C22.68 6.13 17.87 1.32 11.93 1.32S1.18 6.13 1.18 12.07c0 5.37 3.93 9.82 9.07 10.61v-7.51H7.66v-3.1h2.59V9.7c0-2.56 1.52-3.97 3.85-3.97 1.12 0 2.28.2 2.28.2v2.51h-1.28c-1.27 0-1.66.79-1.66 1.6v1.92h2.83l-.45 3.1h-2.38v7.51c5.14-.79 9.07-5.24 9.07-10.61z" />
    </svg>
  )
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
  const closeRef = useRef(null)
  const cardRef = useRef(null)
  const copyTimer = useRef(null)
  /** The promo clip, ready to hand to the OS the moment a button is tapped. */
  const clipFile = useRef(null)

  useLockBodyScroll(open)

  /**
   * Whether this is a phone, for the wording on the "More apps" row only.
   *
   * On a phone the device sheet is the best thing here: it lists WhatsApp,
   * Instagram and TikTok and genuinely launches them. On a laptop it is worth
   * saying what it is good for, because WhatsApp Desktop is the one target
   * that comes out worse through it — see the note on that row.
   */
  const onPhone =
    typeof navigator !== 'undefined' && /Android|iPhone|iPod/i.test(navigator.userAgent || '')

  const slug = video?.slug || video?.id || ''
  const url = video ? `${window.location.origin}/watch/${slug}` : ''
  const ogCard = video ? `${window.location.origin}/og/card/${encodeURIComponent(slug)}.jpg` : ''
  /* The JPEG WhatsApp actually fetches — not the raw thumbnail with CSS on top. */
  const still = ogCard || mediaUrl(video?.thumbnailUrl)
  const creator = video?.creator?.name
  const verified = Boolean(video?.creator?.verified)
  const paid = Number(video?.priceTzs || 0) > 0
  const fresh =
    video?.publishedAt && Date.now() - new Date(video.publishedAt).getTime() < 1000 * 60 * 60 * 24 * 21

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    setCopied(false)
    setProblem(null)
    setHint(null)
    setSaving(null)
    setPosterOn(false)
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

  /**
   * Fetch the promo clip up front, while the sheet is open and nobody is
   * waiting.
   *
   * Instagram and TikTok have no web composer — there is no URL that posts to
   * them. What they do accept is a video handed over by the operating system.
   * `navigator.share` can do that, but only if it is called inside the tap
   * itself: any await beforehand and iOS treats it as a share the page tried
   * to start on its own and refuses. So the file has to already be in hand
   * when the finger lands, which is what this does.
   */
  useEffect(() => {
    if (!open || !clip?.downloadUrl) return
    let stop = false
    clipFile.current = null
    fetch(mediaUrl(clip.downloadUrl))
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (stop || !blob) return
        clipFile.current = new File([blob], `${slug}-promo.mp4`, { type: 'video/mp4' })
      })
      .catch(() => {})
    return () => {
      stop = true
    }
  }, [open, clip?.downloadUrl, slug])

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
      a.href = mediaUrl(clip.downloadUrl)
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
    if (typeof navigator !== 'undefined' && navigator.share) {
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
          People receive a <b>poster card</b> — title, creator, MTONYO+. Tapping it
          opens this video here. The free preview plays on MTONYO+, not inside WhatsApp.
        </p>

        <p className="share-kicker">
          <Eye size={14} />
          This is what your audience will see
        </p>

        <div className="share-og" ref={cardRef}>
          <div className="share-og-stage">
            {still ? (
              <>
                {!posterOn && (
                  <span className="share-og-loading" role="status" aria-label="Loading preview">
                    <Loader2 size={20} className="spin" />
                    <em>Building your preview…</em>
                  </span>
                )}
                <img
                  src={still}
                  alt=""
                  /* Not lazy: this is the whole point of the sheet and it is
                     already on screen. Lazy loading delayed the one image the
                     person opened this to look at. */
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
            {!ogCard && (
              <>
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

        {/* An anchor, not a button with a handler: iOS follows a link the
            person tapped and refuses a location the script assigned. */}
        <a
          className="share-wa"
          href={whatsappHref(url)}
          target={whatsappTarget()}
          rel="noopener noreferrer"
          onClick={whatsappFallback(url)}
        >
          <IconWhatsApp size={26} />
          <span className="share-wa-copy">
            <b>Share on WhatsApp</b>
            <small>Opens WhatsApp with this video</small>
          </span>
        </a>

        <div className="share-targets share-targets-direct">
          <a
            className="share-target is-fb"
            href={facebookHref(url)}
            target={socialTarget()}
            rel="noopener noreferrer"
          >
            <IconFacebook />
            <b>Facebook</b>
            <small>Opens Facebook with this link</small>
          </a>
          <button className="share-target is-copy" type="button" onClick={copy}>
            {copied ? <Check size={22} /> : <IconLink />}
            <b>{copied ? 'Copied' : 'Copy link'}</b>
            <small>Paste anywhere</small>
          </button>
        </div>

        <button className="share-row" type="button" onClick={shareNative} disabled={busy}>
          {busy ? <Loader2 className="spin" size={20} /> : <IconShareNodes />}
          <span>
            <b>More apps</b>
            {/**
              * WhatsApp Desktop sends a shared link the instant it receives
              * it, without the pause its compose box takes to fetch a
              * preview — so the same URL that arrives with a full card when
              * pasted, or sent from the button above, arrives as a bare link
              * through here. It is the app's own behaviour and nothing the
              * page can set. Rather than let someone find that out after
              * sending, the row says what it is good for.
              */}
            <small>
              {onPhone
                ? 'Device share sheet — Instagram, TikTok and others. Not a direct app open.'
                : 'Email, Teams and others. For WhatsApp use the green button so the poster card is sent.'}
            </small>
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
              {clip?.downloadUrl ? 'Save 60s promo clip' : 'Prepare 60s promo clip'}
              <em className="share-pill">Perfect for promotion</em>
            </b>
            <small>Download the clip, then post it on Instagram or TikTok yourself. Those apps cannot be opened into a share composer from the web.</small>
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
