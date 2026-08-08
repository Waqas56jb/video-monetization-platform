import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Film,
  Info,
  RefreshCw,
  Send,
  ShieldCheck,
  UploadCloud,
  X,
} from 'lucide-react'
import Panel from '../Panel'
import Field from '@/components/ui/Field'
import Icon from '@/components/ui/Icon'
import api from '@/lib/api'
import {
  ACCEPTED,
  fileSize,
  uploadToCloudflare,
  validateFile,
  watchEncoding,
} from '@/lib/upload'
import { useToast } from '@/context/ToastContext'

/**
 * Publishing a video, for real.
 *
 * The file goes straight from this browser to Cloudflare — it never passes
 * through our server, which is what makes a large upload from a phone on
 * mobile data workable at all.
 *
 * Nothing here can publish. A creator reaches "awaiting review" and stops;
 * publication is an admin decision and the database refuses anything else. That
 * was the client's rule and it is not a matter of which buttons are shown.
 */

const SELL_OPTIONS = [
  {
    value: 'ppv_forever',
    icon: 'infinity',
    title: 'PPV Forever',
    text: 'Set a price and keep it paid forever. Fans buy once, own it always.',
  },
  {
    value: 'paid_premiere',
    icon: 'calendar-clock',
    title: 'Paid Premiere',
    text: 'Paid for a set period, then auto-releases free with ads — and keeps earning.',
  },
  {
    value: 'free_with_ads',
    icon: 'megaphone',
    title: 'Free with Ads',
    text: 'Free to watch from day one. You earn from advertising instead of sales.',
  },
]

const STEP = {
  idle: 'Choose a file',
  uploading: 'Uploading to secure streaming servers',
  encoding: 'Cloudflare is preparing your video',
  ready: 'Ready — add the details and submit',
  failed: 'Something went wrong',
}

export default function UploadTab({ onSubmitted }) {
  const showToast = useToast()
  const inputRef = useRef(null)
  const uploadRef = useRef(null)
  const watchRef = useRef(null)

  const [file, setFile] = useState(null)
  const [step, setStep] = useState('idle')
  const [progress, setProgress] = useState(0)
  const [encodeProgress, setEncodeProgress] = useState(0)
  const [error, setError] = useState(null)
  const [dragging, setDragging] = useState(false)

  const [video, setVideo] = useState(null) // our record, once created
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: '',
    accessType: 'paid_premiere',
    priceTzs: 1000,
    premiereDays: 30,
    freePreviewMinutes: 5,
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  /* -------- my submissions, from the API -------- */
  const [mine, setMine] = useState([])
  const [mineLoading, setMineLoading] = useState(true)

  const loadMine = useCallback(async () => {
    try {
      const res = await api.videos.mine()
      setMine(res.videos || [])
    } catch {
      /* the panel simply shows nothing */
    } finally {
      setMineLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMine()
  }, [loadMine])

  // An upload in flight must be abandoned if the creator navigates away,
  // otherwise it carries on in the background against a dead component.
  useEffect(
    () => () => {
      uploadRef.current?.abort?.()
      watchRef.current?.cancel?.()
    },
    []
  )

  const set = (key) => (e) => {
    const raw = e?.target ? e.target.value : e
    setForm((f) => ({ ...f, [key]: raw }))
  }

  /* ------------------------------------------------------------ upload */

  const start = async (chosen) => {
    const problem = validateFile(chosen)
    if (problem) {
      setError(problem)
      return
    }

    setError(null)
    setFile(chosen)
    setProgress(0)
    setEncodeProgress(0)

    // Give the video a working title from the filename so the record is never
    // nameless; they can change it below before submitting.
    const guessedTitle =
      form.title.trim() || chosen.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 160)

    try {
      setStep('uploading')
      const created = await api.videos.create({
        title: guessedTitle,
        description: form.description || undefined,
        category: form.category || undefined,
      })

      setVideo(created.video)
      setForm((f) => ({ ...f, title: f.title || created.video.title }))

      if (!created.upload?.url) {
        throw new Error(
          created.upload?.note || 'Video uploads are not available right now. Try again shortly.'
        )
      }

      uploadRef.current = uploadToCloudflare(chosen, created.upload.url, (pct) => setProgress(pct))
      await uploadRef.current.promise

      setStep('encoding')
      watchRef.current = watchEncoding(created.video.id, api, {
        onProgress: (pct) => setEncodeProgress(pct),
      })
      const done = await watchRef.current.promise

      setVideo(done.video)

      // Only now do we know how long the video is. A preview cannot be longer
      // than the thing it previews, so pull it inside — silently accepting a
      // five-minute preview of a two-minute clip only fails later, at save.
      const seconds = Number(done.video?.durationSeconds) || 0
      if (seconds > 0) {
        const mostMinutes = Math.max(0, Math.floor((seconds - 1) / 60))
        setForm((f) =>
          Number(f.freePreviewMinutes) > mostMinutes
            ? { ...f, freePreviewMinutes: mostMinutes }
            : f
        )
      }

      setStep('ready')
      showToast('Upload complete — add the details and submit for review')
      loadMine()
    } catch (err) {
      setError(err.message)
      setStep('failed')
    }
  }

  const cancel = () => {
    uploadRef.current?.abort?.()
    watchRef.current?.cancel?.()
    setStep('idle')
    setFile(null)
    setProgress(0)
    setEncodeProgress(0)
    setError(null)
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const dropped = e.dataTransfer?.files?.[0]
    if (dropped) start(dropped)
  }

  /* ------------------------------------------------------------ submit */

  const submit = async () => {
    if (!video) return
    if (form.title.trim().length < 3) return setError('Give the video a title')

    setSubmitting(true)
    setError(null)
    try {
      await api.videos.update(video.id, {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        category: form.category.trim() || undefined,
        accessType: form.accessType,
        priceTzs: form.accessType === 'free_with_ads' ? 0 : Number(form.priceTzs) || 0,
        freePreviewSeconds: Math.round(Number(form.freePreviewMinutes || 0) * 60),
        ...(form.accessType === 'paid_premiere' ? { premiereDays: Number(form.premiereDays) } : {}),
      })

      const res = await api.videos.submit(video.id)
      setSubmitted(true)
      showToast(res.message || 'Submitted for review')
      loadMine()
      onSubmitted?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const reset = () => {
    setVideo(null)
    setFile(null)
    setStep('idle')
    setProgress(0)
    setEncodeProgress(0)
    setSubmitted(false)
    setError(null)
    setForm({
      title: '',
      description: '',
      category: '',
      accessType: 'paid_premiere',
      priceTzs: 1000,
      premiereDays: 30,
      freePreviewMinutes: 5,
    })
  }

  const busy = step === 'uploading' || step === 'encoding'
  const canSubmit = step === 'ready' && !submitted

  // Until the video is encoded we do not know its length, so allow anything
  // reasonable; afterwards, the running time is the ceiling.
  const durationSeconds = Number(video?.durationSeconds) || 0
  const maxPreviewMinutes = durationSeconds ? Math.max(0, Math.floor((durationSeconds - 1) / 60)) : 120

  return (
    <div className="two-col">
      {/* ---- left column: file + details ---- */}
      <div>
        <Panel title="1 · Upload Your Video">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            style={{ display: 'none' }}
            onChange={(e) => e.target.files?.[0] && start(e.target.files[0])}
          />

          {step === 'idle' || step === 'failed' ? (
            <>
              <button
                type="button"
                className={`upload-zone ${dragging ? 'is-drag' : ''}`.trim()}
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
              >
                <span className="uz-ic">
                  <UploadCloud />
                </span>
                <h4>Drag &amp; drop your video here</h4>
                <p>
                  or <b>browse files</b> — MP4, MOV, MKV up to 4 GB · uploads go straight to secure
                  streaming servers, never through our site
                </p>
              </button>
              {error && (
                <div className="form-error" role="alert" style={{ marginTop: 14 }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                  <span>{error}</span>
                </div>
              )}
            </>
          ) : (
            <div className="upload-live">
              <div className="ul-head">
                <span className="ul-ic">
                  {step === 'ready' ? <CheckCircle2 /> : <Film />}
                </span>
                <div>
                  <b>{file?.name}</b>
                  <small>
                    {fileSize(file?.size)} · {STEP[step]}
                  </small>
                </div>
                {busy && (
                  <button className="ul-cancel" onClick={cancel} aria-label="Cancel upload">
                    <X size={16} />
                  </button>
                )}
              </div>

              {step === 'uploading' && (
                <>
                  <div className="ul-bar">
                    <span style={{ width: `${progress}%` }} />
                  </div>
                  <small className="ul-note">
                    {progress}% · {fileSize((file?.size || 0) * (progress / 100))} of{' '}
                    {fileSize(file?.size)}
                  </small>
                </>
              )}

              {step === 'encoding' && (
                <>
                  <div className="ul-bar">
                    <span className="is-encoding" style={{ width: `${Math.max(encodeProgress, 5)}%` }} />
                  </div>
                  <small className="ul-note">
                    {encodeProgress}% · preparing every quality level so it plays on any connection.
                    You can fill in the details below while this finishes.
                  </small>
                </>
              )}

              {step === 'ready' && (
                <small className="ul-note ul-ok">
                  <Check size={13} /> Ready to play
                  {video?.durationSeconds ? ` · ${formatDuration(video.durationSeconds)}` : ''}
                </small>
              )}

              {error && (
                <div className="form-error" role="alert" style={{ marginTop: 12 }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                  <span>{error}</span>
                </div>
              )}
            </div>
          )}
        </Panel>

        <Panel title="2 · Video Details">
          <Field
            id="up-title"
            label="Video Title"
            icon="type"
            type="text"
            placeholder="The Journey — Live Performance"
            value={form.title}
            onChange={set('title')}
            maxLength={160}
          />
          <Field
            id="up-desc"
            label="Description"
            icon="align-left"
            type="text"
            placeholder="An exclusive live performance from Dar es Salaam."
            value={form.description}
            onChange={set('description')}
            maxLength={4000}
          />
          <div className="form-grid">
            <Field
              id="up-cat"
              label="Category"
              icon="tag"
              type="text"
              placeholder="Music"
              value={form.category}
              onChange={set('category')}
              maxLength={60}
            />
            <Field
              id="up-preview"
              label="Free preview (minutes)"
              icon="timer"
              type="number"
              min={0}
              max={maxPreviewMinutes}
              value={form.freePreviewMinutes}
              onChange={set('freePreviewMinutes')}
            />
          </div>
          {durationSeconds > 0 && (
            <p className="field-hint">
              This video runs {formatDuration(durationSeconds)}, so the preview can be at most{' '}
              {maxPreviewMinutes} minute{maxPreviewMinutes === 1 ? '' : 's'}.
            </p>
          )}
        </Panel>
      </div>

      {/* ---- right column: pricing + submissions ---- */}
      <div>
        <Panel title="3 · Pricing & Access">
          <div className="sell-opts">
            {SELL_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`sell-opt ${form.accessType === o.value ? 'on' : ''}`.trim()}
                onClick={() => setForm((f) => ({ ...f, accessType: o.value }))}
                aria-pressed={form.accessType === o.value}
              >
                <span className="check">
                  <Check />
                </span>
                <b>
                  <Icon name={o.icon} />
                  {o.title}
                </b>
                <p>{o.text}</p>
              </button>
            ))}
          </div>

          {form.accessType !== 'free_with_ads' && (
            <div className="form-grid" style={{ marginTop: 20 }}>
              <Field
                id="up-price"
                label="Price (TZS)"
                icon="banknote"
                type="number"
                min={0}
                value={form.priceTzs}
                onChange={set('priceTzs')}
              />
              {form.accessType === 'paid_premiere' && (
                <Field
                  id="up-window"
                  label="Paid for (days)"
                  icon="hourglass"
                  type="number"
                  min={1}
                  max={3650}
                  value={form.premiereDays}
                  onChange={set('premiereDays')}
                />
              )}
            </div>
          )}

          {form.accessType === 'paid_premiere' && (
            <div className="notice">
              <Info />
              <span>
                After <b>{form.premiereDays || 0} days</b> this video automatically becomes{' '}
                <b>FREE WITH ADS</b> and continues earning ad revenue for you. The MTONYO+ team can
                adjust this window when they review it.
              </span>
            </div>
          )}

          {form.accessType === 'free_with_ads' && (
            <div className="notice">
              <Info />
              <span>
                This video will be free to watch from day one. You earn a share of the advertising
                shown before it.
              </span>
            </div>
          )}

          {/* Creators can never publish directly — every upload goes to review. */}
          <div className="notice notice-review">
            <ShieldCheck />
            <span>
              Every upload is reviewed by the MTONYO+ team before it goes live. You&apos;ll be
              notified as soon as it&apos;s approved — usually within a few hours.
            </span>
          </div>

          {submitted ? (
            <>
              <div className="notice">
                <CheckCircle2 />
                <span>
                  <b>{form.title}</b> is with the review team. You&apos;ll get a notification the
                  moment they decide.
                </span>
              </div>
              <button className="btn btn-ghost btn-block" onClick={reset}>
                <UploadCloud />
                Upload another video
              </button>
            </>
          ) : (
            <button
              className="btn btn-gold btn-block"
              onClick={submit}
              disabled={!canSubmit || submitting}
              title={
                canSubmit ? 'Send this to the review team' : 'Finish uploading your video first'
              }
            >
              <Send />
              {submitting ? 'Submitting…' : 'Submit for Review'}
            </button>
          )}
        </Panel>

        <Panel title="4 · My Submissions">
          {mineLoading ? (
            <div className="skeleton-wrap">
              <div className="skeleton" />
              <div className="skeleton" />
            </div>
          ) : !mine.length ? (
            <div className="state-block">
              <Film size={24} />
              <b>Nothing uploaded yet</b>
              <p>Your videos and their review status will show up here.</p>
            </div>
          ) : (
            <div className="sub-list">
              {mine.map((v) => {
                const state = reviewState(v)
                return (
                  <div className={`sub-item is-${state.key}`} key={v.id}>
                    {v.thumbnailUrl ? (
                      <img src={v.thumbnailUrl} alt="" loading="lazy" />
                    ) : (
                      <span className="sub-thumb-blank" />
                    )}
                    <div className="sub-info">
                      <b>{v.title}</b>
                      <small>
                        {[v.category, accessLabel(v.accessType), priceLabel(v)]
                          .filter(Boolean)
                          .join(' · ')}
                      </small>
                      <span className={`pill ${state.pill} sub-status`}>
                        <Icon name={state.icon} />
                        {state.label}
                      </span>
                      {state.key === 'pending' && (
                        <small className="sub-note">Waiting for the review team.</small>
                      )}
                      {state.key === 'rejected' && v.rejectionReason && (
                        <small className="sub-note sub-reason">
                          <b>Reason:</b> {v.rejectionReason}
                        </small>
                      )}
                      {state.key === 'draft' && (
                        <small className="sub-note">
                          Not submitted yet — finish the details and send it for review.
                        </small>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- helpers */

function reviewState(v) {
  if (v.deletedAt) return { key: 'rejected', pill: 'bad', icon: 'x-circle', label: 'Removed' }
  if (v.reviewStatus === 'rejected') return { key: 'rejected', pill: 'bad', icon: 'x-circle', label: 'Rejected' }
  if (v.reviewStatus === 'pending_review')
    return { key: 'pending', pill: 'pend', icon: 'hourglass', label: 'Awaiting review' }
  if (v.isPublished) return { key: 'live', pill: 'ok', icon: 'check-circle-2', label: 'Live' }
  if (v.reviewStatus === 'approved')
    return { key: 'live', pill: 'ok', icon: 'check-circle-2', label: 'Approved' }
  return { key: 'draft', pill: '', icon: 'pencil', label: 'Draft' }
}

const accessLabel = (t) =>
  ({ ppv_forever: 'PPV Forever', paid_premiere: 'Paid Premiere', free_with_ads: 'Free with ads' })[t]

const priceLabel = (v) =>
  v.accessType === 'free_with_ads' ? 'Free' : `TZS ${Number(v.priceTzs || 0).toLocaleString()}`

const formatDuration = (secs) => {
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
