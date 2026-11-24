import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Monitor, RefreshCw, Smartphone, SkipForward, X } from 'lucide-react'
import api from '@/lib/api'
import useLockBodyScroll from '@/hooks/useLockBodyScroll'

/**
 * The advert as a viewer will see it, before it goes live (Ads Management
 * control center, client 2026-11-17: "actual ad preview, preview button before
 * publish, desktop/mobile preview").
 *
 * Plays the uploaded creative from Cloudflare inside a copy of the player's ad
 * overlay: the same "Ad · advertiser" badge, the same Skip countdown with this
 * campaign's own skip time, the same "Learn more" button when it has a link.
 * Nothing is counted: this is not an impression.
 */
export function useCountdown(running, from) {
  const [left, setLeft] = useState(from)
  useEffect(() => {
    setLeft(from)
    if (!running || !from) return undefined
    const t = setInterval(() => setLeft((n) => (n > 0 ? n - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [running, from])
  return left
}

function iframeSrc(src) {
  try {
    const url = new URL(src)
    url.searchParams.set('autoplay', 'true')
    url.searchParams.set('muted', 'true')
    url.searchParams.set('controls', 'false')
    url.searchParams.set('letterboxColor', '000000')
    return url.toString()
  } catch {
    return src
  }
}

export function AdStage({ campaign, src, mobile }) {
  const skipAfter = Number(campaign.skipAfterSeconds ?? 5)
  const skippable = skipAfter > 0
  const left = useCountdown(Boolean(src), skipAfter)
  return (
    <div className={`adpv-stage ${mobile ? 'is-mobile' : ''}`.trim()}>
      {src ? (
        <iframe
          className="adpv-frame"
          src={iframeSrc(src)}
          title={`Advert preview — ${campaign.advertiser || campaign.name}`}
          allow="autoplay; encrypted-media; picture-in-picture"
        />
      ) : (
        <div className="adpv-frame adpv-blank" />
      )}
      <div className="adpv-badge">
        <span className="adpv-tag">Ad</span>
        {campaign.advertiser || campaign.name}
      </div>
      {campaign.clickUrl && <span className="adpv-learn">Learn more</span>}
      {skippable ? (
        <span className={`adpv-skip ${left === 0 ? 'is-ready' : ''}`.trim()}>
          {left === 0 ? (
            <>
              Skip ad <SkipForward size={14} />
            </>
          ) : (
            `Skip in ${left}`
          )}
        </span>
      ) : (
        <span className="adpv-skip">Not skippable</span>
      )}
      {!mobile && <p className="adpv-note">This video is free because of adverts like this one — the creator earns from it.</p>}
    </div>
  )
}

export default function AdPreview({ campaign, open, onClose }) {
  const [device, setDevice] = useState('desktop')
  const [state, setState] = useState({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useLockBodyScroll(open)

  useEffect(() => {
    if (!open || !campaign?.id) return undefined
    let alive = true
    setState({ status: 'loading' })
    api.admin
      .adPreview(campaign.id)
      .then((res) => alive && setState(res?.ad?.iframe ? { status: 'ready', ad: res.ad } : { status: 'empty', note: res?.note || 'Upload the advert to preview it.' }))
      .catch((err) => alive && setState({ status: 'error', note: err.message }))
    return () => {
      alive = false
    }
  }, [open, campaign?.id, attempt])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !campaign) return null
  const mobile = device === 'mobile'
  const placements = (campaign.placements || []).map((p) => p.replace('_roll', '-roll')).join(', ')

  const body = (
    <div className="video-preview-overlay adpv-overlay" role="dialog" aria-modal="true" aria-label={`Preview ${campaign.name}`}>
      <div className="video-preview-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="video-preview-dialog adpv-dialog">
        <button className="modal-x" onClick={onClose} aria-label="Close preview">
          <X />
        </button>
        <div className="preview-head">
          <b>Preview · {campaign.name}</b>
          <small>
            {campaign.advertiser ? `${campaign.advertiser} · ` : ''}
            {placements || 'pre-roll'} · {Number(campaign.skipAfterSeconds) > 0 ? `skippable after ${campaign.skipAfterSeconds}s` : 'not skippable'}
            {campaign.clickUrl ? ' · Learn more opens the advertiser link' : ''}
          </small>
        </div>

        <div className="seg adpv-seg" role="tablist" aria-label="Preview size">
          <button type="button" role="tab" aria-selected={!mobile} className={!mobile ? 'on' : ''} onClick={() => setDevice('desktop')}>
            <Monitor size={14} /> Desktop
          </button>
          <button type="button" role="tab" aria-selected={mobile} className={mobile ? 'on' : ''} onClick={() => setDevice('mobile')}>
            <Smartphone size={14} /> Mobile
          </button>
        </div>

        {state.status === 'ready' || state.status === 'loading' ? (
          mobile ? (
            <div className="adpv-phone">
              <div className="adpv-phone-bar" />
              <AdStage campaign={campaign} src={state.ad?.iframe} mobile key={`m-${attempt}`} />
              <div className="adpv-phone-page">
                <span className="sk" style={{ width: '80%' }} />
                <span className="sk" style={{ width: '55%' }} />
                <span className="sk" style={{ width: '65%' }} />
              </div>
            </div>
          ) : (
            <div className="adpv-desktop">
              <AdStage campaign={campaign} src={state.ad?.iframe} key={`d-${attempt}`} />
            </div>
          )
        ) : (
          <div className="state-block">
            <AlertTriangle size={24} />
            <b>{state.status === 'error' ? 'Could not load the advert' : 'Nothing to preview yet'}</b>
            <p>{state.note}</p>
            {state.status === 'error' && (
              <button className="btn btn-ghost" type="button" onClick={() => setAttempt((n) => n + 1)}>
                <RefreshCw size={14} /> Try again
              </button>
            )}
          </div>
        )}
        <p className="field-note preview-note">Preview only — nothing is counted and nobody is charged.</p>
      </div>
    </div>
  )
  return typeof document !== 'undefined' ? createPortal(body, document.body) : body
}
