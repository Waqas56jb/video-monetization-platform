import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, RefreshCw, X } from 'lucide-react'
import api, { mediaUrl } from '@/lib/api'
import useLockBodyScroll from '@/hooks/useLockBodyScroll'

function buildIframeSrc(src, poster) {
  try {
    const url = new URL(src)
    if (poster) url.searchParams.set('poster', poster)
    url.searchParams.set('autoplay', 'true')
    url.searchParams.set('muted', 'true')
    url.searchParams.set('letterboxColor', '000000')
    url.searchParams.set('preload', 'auto')
    return url.toString()
  } catch {
    return src
  }
}

/**
 * Watch a video without leaving the queue.
 *
 * Reviewing means watching. Staff get the full video when available, not
 * just the free preview clip — the server decides that.
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
            ? { status: 'ready', src: res.playback.iframe, kind: res.playback.kind }
            : { status: 'empty', note: res?.note || 'This video has no playable media yet.' }
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

  const poster = video?.thumbnailUrl ? mediaUrl(video.thumbnailUrl) : ''

  const modal = (
    <div
      className="modal open preview-modal"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${video?.title}`}
    >
      <div className="modal-bg" onClick={onClose} />
      <div className="modal-card preview-card">
        <button className="modal-x" onClick={onClose} aria-label="Close preview">
          <X />
        </button>

        <div className="preview-head">
          <b>{video?.title}</b>
          {video?.creator?.name && <small>{video.creator.name}</small>}
        </div>

        {state.status === 'loading' && (
          <div className="preview-player">
            <div className="sk preview-frame" />
          </div>
        )}

        {state.status === 'ready' && (
          <div className="preview-player">
            <div className="preview-shell">
              <iframe
                className="preview-frame"
                src={buildIframeSrc(state.src, poster)}
                title={video?.title || 'Video preview'}
                allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
              />
            </div>
            {state.kind === 'preview' && (
              <p className="field-note preview-note">
                Showing the free preview clip — the full video was not available.
              </p>
            )}
          </div>
        )}

        {(state.status === 'empty' || state.status === 'error') && (
          <div className="preview-player">
            <div className="state-block">
              <AlertTriangle size={24} />
              <b>{state.status === 'error' ? 'Could not load it' : 'Nothing to play'}</b>
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
