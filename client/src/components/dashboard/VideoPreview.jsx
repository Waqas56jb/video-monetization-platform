import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, RefreshCw, X } from 'lucide-react'
import StreamPlayer from '@/components/watch/StreamPlayer'
import api, { mediaUrl } from '@/lib/api'
import useLockBodyScroll from '@/hooks/useLockBodyScroll'

const OVERLAY_STYLE = {
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  display: 'grid',
  placeItems: 'center',
}

/**
 * A creator watching their own video.
 *
 * Nobody should have to submit something for review, wait, and only find out
 * afterwards that they uploaded the wrong file or that it came out sideways.
 * This plays the full video — the creator owns it, so the server hands over
 * full playback, paywall or no paywall.
 */
export default function VideoPreview({ video, open, onClose }) {
  const [state, setState] = useState({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useLockBodyScroll(open)

  useEffect(() => {
    if (!open || !video?.id) return
    let alive = true
    setState({ status: 'loading' })

    api
      .playback(video.id)
      .then((res) => {
        if (!alive) return
        setState(
          res?.playback?.iframe
            ? { status: 'ready', src: res.playback.iframe }
            : { status: 'empty', note: res?.note || 'This video is not ready to play yet.' }
        )
      })
      .catch((err) => alive && setState({ status: 'error', note: err.message }))

    return () => {
      alive = false
    }
  }, [open, video?.id, attempt])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const modal = (
    <div
      className="video-preview-overlay"
      style={OVERLAY_STYLE}
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${video?.title || 'your video'}`}
    >
      <div className="video-preview-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="video-preview-dialog">
        <button className="modal-x" onClick={onClose} aria-label="Close preview">
          <X />
        </button>

        <div className="preview-head">
          <b>{video?.title}</b>
          <small>Only you can see this until it is approved</small>
        </div>

        {state.status === 'loading' && (
          <div className="preview-player">
            <div className="skeleton preview-frame" />
          </div>
        )}

        {state.status === 'ready' && (
          <div className="preview-player">
            <StreamPlayer
              src={state.src}
              poster={mediaUrl(video?.thumbnailUrl)}
              title={video?.title}
              autoplay
              playOnReady
            />
          </div>
        )}

        {(state.status === 'empty' || state.status === 'error') && (
          <div className="preview-player">
            <div className="state-block">
              <AlertTriangle />
              <b>{state.status === 'error' ? 'Could not load it' : 'Not ready yet'}</b>
              <p>{state.note}</p>
              <button className="btn btn-ghost" type="button" onClick={() => setAttempt((n) => n + 1)}>
                <RefreshCw size={14} />
                Try again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : modal
}
