import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Film, Play, Plus, Send, Trash2, X } from 'lucide-react'
import Panel from '../Panel'
import TableScroll from '@/components/ui/TableScroll'
import BusyButton from '@/components/ui/BusyButton'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import Field, { SelectField } from '@/components/ui/Field'
import PreviewDuration, { splitSeconds, toSeconds, maxFreePreviewSeconds } from '@/components/dashboard/PreviewDuration'
import useApi, { tzs, compact, ACCESS_SHORT } from '@/hooks/useApi'
import useLockBodyScroll from '@/hooks/useLockBodyScroll'
import { CATEGORIES, PREMIERE_WINDOWS } from '@/data/copy'
import api from '@/lib/api'
import { useToast, useNotify } from '@/context/ToastContext'
import VideoPreview from '@/components/dashboard/VideoPreview'

/**
 * Everything this creator has uploaded, in whatever state it is in.
 *
 * There is no delete button, and there never will be. A creator may *request*
 * removal; an admin decides. That is the client's rule, and it exists because
 * somebody may have paid for the video — their purchase must not vanish
 * because the creator changed their mind.
 */
export default function MyVideosTab({ onNewUpload }) {
  const showToast = useToast()
  const notify = useNotify()
  const [previewing, setPreviewing] = useState(null)
  const [openingId, setOpeningId] = useState(null)
  const { data, loading, error, reload } = useApi(() => api.videos.mine(), [])
  const videos = data?.videos || []

  const openPreview = (v) => {
    if (v.state === 'processing') {
      notify.info('Still encoding — usually 1–3 min')
      return
    }
    setOpeningId(v.id)
    setPreviewing(v)
    requestAnimationFrame(() => setOpeningId(null))
  }

  const requestRemoval = async (v) => {
    const reason = window.prompt(
      `Ask an administrator to take down "${v.title}"?\n\n` +
        'Anyone who has already bought it keeps their access — that never changes.\n' +
        'Tell them why (optional):'
    )
    if (reason === null) return
    try {
      const res = await api.videos.requestDeletion(v.id, reason.trim() || undefined)
      showToast(res.message || 'Removal requested')
      reload({ quiet: true })
    } catch (err) {
      showToast(err.message)
    }
  }

  /**
   * Editing a submission that has come back.
   *
   * This table was read-only, which made "Changes requested" — and "Rejected"
   * before it — a dead end: the creator was told exactly what to fix and given
   * no way to fix it. Their only option was to upload the whole file again.
   *
   * Anything not yet approved can be corrected here and sent straight back. The
   * file is untouched; only the details around it change.
   */
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  useLockBodyScroll(Boolean(editing))

  const canEdit = (v) =>
    !v.deletedAt &&
    !v.isPublished &&
    v.reviewStatus !== 'pending_review' &&
    v.reviewStatus !== 'approved'

  const startEdit = (v) => {
    const preview = splitSeconds(v.freePreviewSeconds || 0)
    setEditing(v)
    setForm({
      title: v.title || '',
      description: v.description || '',
      // A category typed before the fixed list existed will not be on it; start
      // them empty rather than showing a value the picker cannot represent.
      category: CATEGORIES.includes(v.category) ? v.category : '',
      accessType: v.accessType || 'ppv_forever',
      priceTzs: v.priceTzs ?? 0,
      premiereDays: v.premiereDays ?? 30,
      previewValue: preview.value,
      previewUnit: preview.unit,
    })
  }

  const setField = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e?.target ? e.target.value : e }))

  const save = async ({ thenSubmit }) => {
    if (!editing || !form) return
    if (form.title.trim().length < 3) return showToast('Give the video a title')
    const previewSecs = toSeconds(form.previewValue, form.previewUnit)
    const mostPreview = maxFreePreviewSeconds(editing.durationSeconds)
    if (mostPreview != null && previewSecs > mostPreview) {
      return showToast(
        `The longest free preview for this video is ${mostPreview} seconds. A preview never runs past five minutes, and on a short video never past a third of it.`
      )
    }
    setSaving(true)
    try {
      await api.videos.update(editing.id, {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        category: form.category || undefined,
        accessType: form.accessType,
        priceTzs: form.accessType === 'free_with_ads' ? 0 : Number(form.priceTzs) || 0,
        freePreviewSeconds: toSeconds(form.previewValue, form.previewUnit),
        ...(form.accessType === 'paid_premiere' ? { premiereDays: Number(form.premiereDays) } : {}),
      })
      if (thenSubmit) {
        const res = await api.videos.submit(editing.id)
        showToast(res.message || 'Sent for review')
      } else {
        showToast('Changes saved')
      }
      setEditing(null)
      reload({ quiet: true })
    } catch (err) {
      showToast(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Panel
      title="My Videos"
      action={
        <button className="btn btn-gold btn-sm" onClick={onNewUpload}>
          <Plus />
          <span className="btn-label">New Upload</span>
        </button>
      }
    >
      {loading ? (
        <Skeleton rows={4} />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !videos.length ? (
        <EmptyState
          icon={Film}
          title="You haven't uploaded anything yet"
          message="Upload your first video and set your own price. Every upload is reviewed before it goes live."
          action={
            <button className="btn btn-gold" onClick={onNewUpload}>
              <Plus />
              Upload a video
            </button>
          }
        />
      ) : (
        <TableScroll>
          <thead>
            <tr>
              <th>Video</th>
              <th>Type</th>
              <th>Price</th>
              <th>Views</th>
              <th>Sales</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {videos.map((v) => {
              const st = statusOf(v)
              return (
                <tr key={v.id}>
                  <td style={{ fontWeight: 700 }}>
                    {v.title}
                    {v.rejectionReason && (
                      <small
                        style={{ display: 'block', color: 'var(--muted)', fontWeight: 400, marginTop: 3 }}
                      >
                        {v.rejectionReason}
                      </small>
                    )}
                  </td>
                  <td>{ACCESS_SHORT[v.accessType] || v.accessType}</td>
                  <td>{v.accessType === 'free_with_ads' ? 'Free' : tzs(v.priceTzs)}</td>
                  <td>{compact(v.views)}</td>
                  <td>{compact(v.paidUnlocks)}</td>
                  <td>
                    <span className={`pill ${st.pill}`}>{st.label}</span>
                  </td>
                  <td>
                    <BusyButton
                      className="btn btn-ghost btn-sm"
                      busy={openingId === v.id}
                      icon={Play}
                      onClick={() => openPreview(v)}
                      title="Watch this video"
                      style={{ marginRight: 6 }}
                    >
                      <span className="btn-label">Watch</span>
                    </BusyButton>
                    {/* The way back into review. Without it, a note from the
                        reviewer was something to read and nothing to act on. */}
                    {canEdit(v) && (
                      <button
                        className="btn btn-gold btn-sm"
                        onClick={() => startEdit(v)}
                        title="Edit the details and send for review"
                        style={{ marginRight: 6 }}
                      >
                        <Send size={14} />
                        <span className="btn-label">
                          {v.reviewStatus === 'changes_requested'
                            ? 'Fix & resubmit'
                            : v.reviewStatus === 'rejected'
                              ? 'Edit & resubmit'
                              : 'Edit & submit'}
                        </span>
                      </button>
                    )}
                    {/* Requesting, never deleting. */}
                    {v.isPublished && !v.deletedAt && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => requestRemoval(v)}
                        title="Ask an administrator to take this down"
                      >
                        <Trash2 size={14} />
                        <span className="btn-label">Request removal</span>
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </TableScroll>
      )}

      {editing &&
        form &&
        createPortal(
          <div
            className="modal open"
            role="dialog"
            aria-modal="true"
            aria-label={`Edit ${editing.title}`}
          >
            <div className="modal-bg" onClick={() => !saving && setEditing(null)} />
            <div className="modal-card edit-card">
              <button
                className="modal-x"
                onClick={() => setEditing(null)}
                aria-label="Close"
                disabled={saving}
              >
                <X />
              </button>

              <h3>Edit &amp; resubmit</h3>

              {editing.rejectionReason && (
                <div className="notice" style={{ marginTop: 12 }}>
                  <span>
                    <b>The reviewer asked for:</b> {editing.rejectionReason}
                  </span>
                </div>
              )}

              <Field
                id="ev-title"
                label="Video title"
                icon="type"
                type="text"
                value={form.title}
                onChange={setField('title')}
                maxLength={160}
              />
              <Field
                id="ev-desc"
                label="Description"
                icon="align-left"
                type="text"
                value={form.description}
                onChange={setField('description')}
                maxLength={4000}
              />
              <SelectField
                id="ev-cat"
                label="Category"
                icon="tag"
                placeholder="Choose a category"
                options={CATEGORIES}
                value={form.category}
                onChange={setField('category')}
              />
              <SelectField
                id="ev-access"
                label="How people watch it"
                icon="lock"
                options={[
                  { value: 'ppv_forever', label: 'Pay Once' },
                  { value: 'paid_premiere', label: 'Paid Premiere' },
                  { value: 'free_with_ads', label: 'Free + Ads' },
                ]}
                value={form.accessType}
                onChange={setField('accessType')}
              />

              {form.accessType !== 'free_with_ads' && (
                <div className="form-grid">
                  <Field
                    id="ev-price"
                    label="Price (TZS)"
                    icon="banknote"
                    type="number"
                    min={0}
                    value={form.priceTzs}
                    onChange={setField('priceTzs')}
                  />
                  {form.accessType === 'paid_premiere' && (
                    <SelectField
                      id="ev-days"
                      label="Paid for"
                      icon="hourglass"
                      options={PREMIERE_WINDOWS}
                      value={String(form.premiereDays)}
                      onChange={setField('premiereDays')}
                    />
                  )}
                </div>
              )}

              <PreviewDuration
                id="ev-preview"
                value={form.previewValue}
                unit={form.previewUnit}
                videoSeconds={editing.durationSeconds || 0}
                onChange={({ value, unit }) =>
                  setForm((f) => ({ ...f, previewValue: value, previewUnit: unit }))
                }
              />

              <button
                className="btn btn-gold btn-block"
                onClick={() => save({ thenSubmit: true })}
                disabled={saving}
              >
                <Send />
                {saving ? 'Sending…' : 'Save & submit for review'}
              </button>
              <button
                className="btn btn-ghost btn-block"
                onClick={() => save({ thenSubmit: false })}
                disabled={saving}
              >
                Save without submitting
              </button>
            </div>
          </div>,
          document.body
        )}

      <VideoPreview
        video={previewing}
        open={Boolean(previewing)}
        onClose={() => setPreviewing(null)}
      />
    </Panel>
  )
}

function statusOf(v) {
  if (v.deletedAt) return { pill: 'bad', label: 'Removed' }
  if (v.reviewStatus === 'rejected') return { pill: 'bad', label: 'Rejected' }
  /* Not a rejection — the submission is alive and waiting on the creator. */
  if (v.reviewStatus === 'changes_requested') return { pill: 'pend', label: 'Changes requested' }
  if (v.reviewStatus === 'pending_review') return { pill: 'pend', label: 'Awaiting review' }
  if (v.isPublished) return { pill: 'ok', label: 'Live' }
  if (v.reviewStatus === 'approved') return { pill: 'ok', label: 'Approved' }
  if (v.state === 'processing') return { pill: 'pend', label: 'Processing' }
  if (v.state === 'failed') return { pill: 'bad', label: 'Upload failed' }
  return { pill: '', label: 'Draft' }
}
