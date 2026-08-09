import { useEffect, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import api from '@/lib/api'
import useLockBodyScroll from '@/hooks/useLockBodyScroll'

/**
 * Watch a video without leaving the queue.
 *
 * Reviewing means watching. Deciding whether something may be published from
 * its title, its price and a thumbnail is guesswork, and this screen was
 * asking for exactly that.
 *
 * Staff get the full video, not the free preview — the server decides that,
 * and every action taken afterwards is recorded against the name and email of
 * whoever took it.
 *
 * Cloudflare's embedded player rather than a bare <video>: these are HLS
 * streams, which Chrome and Firefox will not play natively, and the src is a
 * signed short-lived token rather than anything reusable.
 */
export default function VideoPreview({ video, open, onClose }) {
  const [state, setState] = useState({ status: 'loading' })

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
  }, [open, video?.id])

  // Escape closes, like any dialog.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal open preview-modal" role="dialog" aria-modal="true" aria-label={`Preview ${video?.title}`}>
      <div className="modal-bg" onClick={onClose} />
      <div className="modal-card preview-card">
        <button className="modal-x" onClick={onClose} aria-label="Close preview">
          <X />
        </button>

        <div className="preview-head">
          <b>{video?.title}</b>
          {video?.creator?.name && <small>{video.creator.name}</small>}
        </div>

        {state.status === 'loading' && <div className="sk preview-frame" />}

        {state.status === 'ready' && (
          <>
            <iframe
              className="preview-frame"
              src={state.src}
              title={video?.title || 'Video preview'}
              allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
              allowFullScreen
            />
            {state.kind === 'preview' && (
              <p className="field-note" style={{ marginTop: 10 }}>
                Showing the free preview clip — the full video was not available.
              </p>
            )}
          </>
        )}

        {(state.status === 'empty' || state.status === 'error') && (
          <div className="state-block">
            <AlertTriangle size={24} />
            <b>{state.status === 'error' ? 'Could not load it' : 'Nothing to play'}</b>
            <p>{state.note}</p>
          </div>
        )}
      </div>
    </div>
  )
}
