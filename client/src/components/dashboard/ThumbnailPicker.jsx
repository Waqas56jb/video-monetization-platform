import { useState } from 'react'
import { Image as ImageIcon, RotateCcw, Sparkles, Upload } from 'lucide-react'
import api, { mediaUrl } from '@/lib/api'
import { useToast } from '@/context/ToastContext'

/**
 * The still that represents the video.
 *
 * Cloudflare picks a frame on its own, and that frame is very often a blur, a
 * half-blink, or the black gap between two shots. It is the single image the
 * whole platform judges a video by, so a creator who has made a proper cover
 * should be able to use it.
 *
 * The automatic one is never thrown away: removing a custom cover falls
 * straight back to it, so nothing is lost by trying.
 */
const MAX_BYTES = 5 * 1024 * 1024

export default function ThumbnailPicker({ video, onChange, disabled = false }) {
  const showToast = useToast()
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(null)

  const custom = Boolean(video?.customThumbnailUrl)
  const shown = preview || mediaUrl(video?.thumbnailUrl)

  const pick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // picking the same file twice should still work
    if (!file) return

    if (!file.type.startsWith('image/')) return showToast('Choose an image file')
    if (file.size > MAX_BYTES) {
      return showToast(`That image is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 5 MB`)
    }

    // Show it at once; the upload catches up behind.
    const local = URL.createObjectURL(file)
    setPreview(local)
    setBusy(true)

    try {
      const res = await api.videos.uploadThumbnail(video.id, file)
      setPreview(null)
      onChange?.(res.video)
      showToast('Cover updated')
    } catch (err) {
      setPreview(null)
      showToast(err.message)
    } finally {
      URL.revokeObjectURL(local)
      setBusy(false)
    }
  }

  const revert = async () => {
    setBusy(true)
    try {
      const res = await api.videos.removeThumbnail(video.id)
      onChange?.(res.video)
      showToast('Back to the frame from the video')
    } catch (err) {
      showToast(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="thumb-picker">
      <div className={`tp-preview ${busy ? 'busy' : ''}`.trim()}>
        {shown ? (
          <img key={shown} src={shown} alt="" />
        ) : (
          <span className="tp-empty">
            <ImageIcon size={22} />
            <small>No cover yet</small>
          </span>
        )}
        <span className={`tp-badge ${custom ? 'is-custom' : ''}`.trim()}>
          {custom ? (
            <>
              <ImageIcon size={11} /> Your cover
            </>
          ) : (
            <>
              <Sparkles size={11} /> Auto
            </>
          )}
        </span>
      </div>

      <div className="tp-side">
        <b>Cover image</b>
        <p>
          {custom
            ? 'Using the image you uploaded. Remove it and the frame from the video comes back.'
            : 'Taken from the video automatically. Upload your own if that frame is not the one you want.'}
        </p>

        <div className="tp-actions">
          <input
            id="video-cover-file"
            className="sr-file"
            type="file"
            accept="image/*"
            disabled={busy || disabled}
            onChange={pick}
          />
          <label
            htmlFor="video-cover-file"
            className={`btn btn-ghost btn-sm ${busy || disabled ? 'is-disabled' : ''}`.trim()}
            aria-disabled={busy || disabled}
          >
            <Upload size={14} />
            {busy ? 'Uploading…' : custom ? 'Replace' : 'Upload your own'}
          </label>
          {custom && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={revert}
              disabled={busy || disabled}
            >
              <RotateCcw size={14} />
              Use the auto one
            </button>
          )}
        </div>

        <small className="field-hint" style={{ margin: 0 }}>
          JPEG, PNG or WebP, up to 5 MB. Landscape 16:9 looks right everywhere.
        </small>
      </div>
    </div>
  )
}
