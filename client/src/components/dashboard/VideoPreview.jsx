import { useEffect, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import StreamPlayer from '@/components/watch/StreamPlayer'
import api, { mediaUrl } from '@/lib/api'
import useLockBodyScroll from '@/hooks/useLockBodyScroll'

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
  }, [open, video?.id])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="modal open preview-modal"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${video?.title || 'your video'}`}
    >
      <div className="modal-bg" onClick={onClose} />
      <div className="modal-card preview-card">
        <button className="modal-x" onClick={onClose} aria-label="Close preview">
          <X />
        </button>

        <div className="preview-head">
          <b>{video?.title}</b>
          <small>Only you can see this until it is approved</small>
        </div>

        {state.status === 'loading' && <div className="skeleton preview-frame" />}

        {state.status === 'ready' && (
          <StreamPlayer
            src={state.src}
            poster={mediaUrl(video?.thumbnailUrl)}
            title={video?.title}
          />
        )}

        {(state.status === 'empty' || state.status === 'error') && (
          <div className="state-block">
            <AlertTriangle />
            <b>{state.status === 'error' ? 'Could not load it' : 'Not ready yet'}</b>
            <p>{state.note}</p>
          </div>
        )}
      </div>
    </div>
  )
}
