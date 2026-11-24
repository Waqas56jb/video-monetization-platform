import { useEffect, useMemo, useRef, useState } from 'react'
import { BarChart3, Eye, Megaphone, Pencil, Save, Send, Trash2, X } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Field from '@/components/ui/Field'
import { StatGrid } from '@/components/ui/StatCard'
import { TableWrap } from '@/components/ui/Table'
import { Async } from '@/components/ui/States'
import SponsorPreview from '@/components/ads/SponsorPreview'
import SponsorStats from '@/components/ads/SponsorStats'
import useApi, { compact, dateTime } from '@/hooks/useApi'
import api from '@/lib/api'
import { sponsorImageProblem } from '@/lib/sponsorImage'
import { useToast } from '@/context/ToastContext'
import { useConfirm } from '@/context/ConfirmContext'

/**
 * Homepage Sponsors (client, 2026-11-17, point 6):
 *   UPLOAD → PREVIEW → SAVE DRAFT → PUBLISH/SCHEDULE → EDIT/PAUSE → VIEW STATS
 *
 * The preview beside the form is the homepage banner itself, redrawn from the
 * form as it is typed (desktop or phone width). A draft is never shown to
 * viewers. Publishing with a future start date schedules it. At most five
 * banners are live at once; they rotate, lowest "order" first.
 */

const EMPTY = { sponsor: '', title: '', tagline: '', cta: '', clickUrl: 'https://', startsAt: '', endsAt: '', position: 0 }

// <input type="datetime-local"> speaks local time with no zone.
const toLocalInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null)

export const SPONSOR_PILL = { live: 'ok', scheduled: 'info', draft: 'free', paused: 'pend', ended: '' }
export const SPONSOR_LABEL = { live: 'Live', scheduled: 'Scheduled', draft: 'Draft', paused: 'Paused', ended: 'Ended' }

/** The state buttons a banner offers. */
export function sponsorActions(s) {
  const out = []
  if (s.state === 'draft') out.push(['publish', s.startsAt && new Date(s.startsAt) > new Date() ? 'Schedule' : 'Publish'])
  if (s.state === 'published' && s.status !== 'ended') out.push(['pause', 'Pause'])
  if (s.state === 'paused' && s.status !== 'ended') out.push(['resume', 'Resume'])
  if (s.state !== 'ended' && s.status !== 'ended') out.push(['end', 'End'])
  return out
}

/** Pure: the form as the API wants it, or the first thing to fix. */
export function sponsorBody(form) {
  if (!form.sponsor.trim()) return { error: 'Enter the sponsor’s name.' }
  if (!form.title.trim()) return { error: 'Enter the headline.' }
  if (!/^https?:\/\/[^\s/]+\.[^\s]+/.test(form.clickUrl.trim())) return { error: 'Enter the full web address the banner opens, starting with https://' }
  const startsAt = fromLocalInput(form.startsAt)
  const endsAt = fromLocalInput(form.endsAt)
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) return { error: 'The end date must be after the start date.' }
  return {
    body: {
      sponsor: form.sponsor.trim(),
      title: form.title.trim(),
      tagline: form.tagline.trim() || null,
      cta: form.cta.trim() || null,
      clickUrl: form.clickUrl.trim(),
      startsAt,
      endsAt,
      position: Number(form.position) || 0,
    },
  }
}

export default function SponsorsTab() {
  const showToast = useToast()
  const confirm = useConfirm()
  const { data, loading, error, reload } = useApi(() => api.admin.sponsors(), [], { refetchOnFocus: true })
  const sponsors = data?.sponsors || []

  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState(null) // the sponsor being edited, or null
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const [image, setImage] = useState(null)
  const [statsFor, setStatsFor] = useState(null)
  const [previewFor, setPreviewFor] = useState(null)
  const fileRef = useRef(null)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  // The chosen file, shown in the preview before it is uploaded.
  const imageSrc = useMemo(() => (image ? URL.createObjectURL(image) : null), [image])
  useEffect(() => () => imageSrc && URL.revokeObjectURL(imageSrc), [imageSrc])

  const reset = () => {
    setForm(EMPTY)
    setEditing(null)
    setImage(null)
    setFormError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const edit = (s) => {
    setEditing(s)
    setForm({ sponsor: s.sponsor, title: s.title, tagline: s.tagline || '', cta: s.cta || '', clickUrl: s.clickUrl, startsAt: toLocalInput(s.startsAt), endsAt: toLocalInput(s.endsAt), position: s.position })
    setImage(null)
    setFormError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /** mode: 'draft' | 'publish' | 'save' (edit in place, keeping its state) */
  const save = (mode) => async (e) => {
    e?.preventDefault?.()
    setFormError(null)
    const { body, error: problem } = sponsorBody(form)
    if (problem) return setFormError(problem)
    const imageError = sponsorImageProblem(image)
    if (imageError) return setFormError(imageError)
    if (mode === 'draft') body.draft = true
    if (mode === 'publish') body.draft = false
    if (mode === 'save' && editing) body.active = editing.state !== 'paused'
    setSaving(true)
    try {
      const res = editing ? await api.admin.updateSponsor(editing.id, body) : await api.admin.createSponsor(body)
      if (image) {
        try {
          await api.admin.sponsorImage(res.sponsor.id, image)
        } catch (err) {
          // Saved without its image. Stay on it, so trying again edits it
          // rather than adding a second one.
          setEditing(res.sponsor)
          setImage(null)
          if (fileRef.current) fileRef.current.value = ''
          setFormError(`Saved, but the image did not upload (${err.message}). Choose the image again and save.`)
          reload({ quiet: true })
          return
        }
      }
      const st = res.sponsor.status
      showToast(
        mode === 'draft' ? 'Saved as a draft — not on the homepage yet'
          : st === 'scheduled' ? `Scheduled — it goes live ${dateTime(res.sponsor.startsAt)}`
            : st === 'live' ? 'Live on the homepage'
              : 'Saved'
      )
      reset()
      reload({ quiet: true })
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const changeState = (s, action) => {
    const run = async () => {
      try {
        const res = await api.admin.sponsorState(s.id, action)
        const st = res.sponsor.status
        showToast(
          action === 'end' ? `"${s.sponsor}" has ended`
            : action === 'pause' ? `"${s.sponsor}" is off the homepage`
              : st === 'scheduled' ? `"${s.sponsor}" is scheduled for ${dateTime(res.sponsor.startsAt)}`
                : `"${s.sponsor}" is live on the homepage`
        )
        reload({ quiet: true })
      } catch (err) {
        showToast(err.message)
      }
    }
    if (action !== 'end') return run()
    return confirm({ title: `End "${s.sponsor}"?`, text: 'It leaves the homepage for good. Its stats stay here.', onConfirm: run })
  }

  const remove = (s) =>
    confirm({
      title: 'Delete this sponsor?',
      text: `"${s.sponsor}" leaves the homepage and its numbers (${compact(s.impressions)} views, ${compact(s.clicks)} clicks) are deleted. To keep the numbers, use End instead.`,
      onConfirm: async () => {
        try {
          await api.admin.deleteSponsor(s.id)
          showToast('Sponsor deleted')
          if (editing?.id === s.id) reset()
          reload({ quiet: true })
        } catch (err) {
          showToast(err.message)
        }
      },
    })

  const live = sponsors.filter((s) => s.status === 'live')
  const stats = [
    { icon: 'megaphone', label: 'Live on the homepage', value: `${live.length} / ${data?.maxLive ?? 5}` },
    { icon: 'calendar-clock', label: 'Scheduled', value: compact(sponsors.filter((s) => s.status === 'scheduled').length) },
    { icon: 'eye', label: 'Banner views', value: compact(sponsors.reduce((n, s) => n + s.impressions, 0)) },
    { icon: 'mouse-pointer-click', label: 'Clicks', value: compact(sponsors.reduce((n, s) => n + s.clicks, 0)) },
  ]

  const banner = { sponsor: form.sponsor, title: form.title, tagline: form.tagline, cta: form.cta, imageSrc: imageSrc || editing?.imageUrl || null }
  const futureStart = form.startsAt && new Date(form.startsAt) > new Date()

  return (
    <div className="tab">
      <StatGrid stats={stats} />

      <Panel title={editing ? `Edit · ${editing.sponsor}` : 'New homepage sponsor'} action={editing && <button className="btn btn-ghost btn-sm" onClick={reset}>Cancel edit</button>}>
        <ol className="sp-steps" aria-label="Steps">
          <li className={image || editing?.imageUrl ? 'done' : ''}>Upload</li>
          <li className={form.title ? 'done' : ''}>Preview</li>
          <li>Save draft</li>
          <li>Publish / schedule</li>
          <li>Edit / pause</li>
          <li>View stats</li>
        </ol>
        <div className="sp-editor">
          <form className="form-grid" onSubmit={save(editing ? 'save' : 'publish')} noValidate>
            <div className="field sp-file">
              <label htmlFor="sp-image">1 · Banner image (JPEG, PNG or WebP, up to 5 MB, wide — about 1200 × 400)</label>
              <input id="sp-image" ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setImage(e.target.files?.[0] || null)} />
              <small className="field-hint">Optional: without an image the banner shows as a text card.</small>
            </div>
            <Field id="sp-sponsor" label="Sponsor name" icon="landmark" maxLength={80} required value={form.sponsor} onChange={set('sponsor')} placeholder="Vodacom Tanzania" />
            <Field id="sp-title" label="Headline" icon="megaphone" maxLength={80} required value={form.title} onChange={set('title')} placeholder="Unlimited data weekends" />
            <Field id="sp-tagline" label="Line under the headline (optional)" icon="mail" maxLength={160} value={form.tagline} onChange={set('tagline')} placeholder="Stream every MTONYO+ release with no worries" />
            <Field id="sp-cta" label="Button text (optional)" icon="mouse-pointer-click" maxLength={30} value={form.cta} onChange={set('cta')} placeholder="Learn more" />
            <Field id="sp-url" label="Opens this address" icon="log-in" type="url" maxLength={500} required value={form.clickUrl} onChange={set('clickUrl')} />
            <Field id="sp-start" label="Starts (empty = as soon as it is published)" icon="hourglass" type="datetime-local" value={form.startsAt} onChange={set('startsAt')} />
            <Field id="sp-end" label="Ends (empty = until you end it)" icon="hourglass" type="datetime-local" value={form.endsAt} onChange={set('endsAt')} />
            <Field id="sp-pos" label="Order (lower shows first)" icon="layout-dashboard" type="number" min={0} max={999} value={form.position} onChange={set('position')} />
            {formError && (
              <p className="form-error" role="alert">
                {formError}
              </p>
            )}
            <div className="camp-actions">
              {editing ? (
                <>
                  <button className="btn btn-gold" type="submit" disabled={saving}>
                    <Save size={16} /> {saving ? 'Saving…' : 'Save changes'}
                  </button>
                  {editing.state === 'draft' && (
                    <button className="btn btn-purple" type="button" disabled={saving} onClick={save('publish')}>
                      <Send size={16} /> {futureStart ? 'Save & schedule' : 'Save & publish'}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button className="btn btn-ghost" type="button" disabled={saving} onClick={save('draft')}>
                    <Save size={16} /> {saving ? 'Saving…' : 'Save draft'}
                  </button>
                  <button className="btn btn-gold" type="submit" disabled={saving}>
                    <Send size={16} /> {saving ? 'Saving…' : futureStart ? 'Schedule' : 'Publish now'}
                  </button>
                </>
              )}
            </div>
            <p className="field-note">
              {editing
                ? `This banner is ${SPONSOR_LABEL[editing.status]?.toLowerCase() || editing.status}. Saving keeps it that way; pause, resume or end it from the list.`
                : futureStart
                  ? 'Schedule: it appears on the homepage on its start date by itself.'
                  : 'Publish now puts it on the homepage at once. Save draft keeps it hidden until you publish it from the list.'}
            </p>
          </form>
          <div className="sp-preview-col">
            <b className="sp-preview-title">
              <Eye size={15} /> 2 · Homepage preview
            </b>
            <SponsorPreview banner={banner} />
          </div>
        </div>
      </Panel>

      <Panel title="Sponsors">
        <Async loading={loading} error={error} onRetry={reload} empty={!sponsors.length} rows={3} emptyProps={{ icon: Megaphone, title: 'No sponsors yet', hint: 'Add one above: upload, preview, then save a draft or publish.' }}>
          <TableWrap>
            <thead>
              <tr>
                <th>Banner</th>
                <th>Sponsor</th>
                <th>Dates</th>
                <th>Views</th>
                <th>Clicks · CTR</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sponsors.map((s) => (
                <tr key={s.id}>
                  <td>
                    <button type="button" className="sp-thumb" onClick={() => setPreviewFor(s)} title="Preview on the homepage">
                      {s.imageUrl ? <img src={s.imageUrl} alt="" /> : <small>text only</small>}
                    </button>
                  </td>
                  <td>
                    <b>{s.sponsor}</b>
                    <div className="cell-sub">{s.title}</div>
                    <div className="cell-sub camp-url" title={s.clickUrl}>
                      → {s.clickUrl.replace(/^https?:\/\//, '')}
                    </div>
                  </td>
                  <td>
                    <small>
                      {s.startsAt ? dateTime(s.startsAt) : 'on publish'} → {s.endsAt ? dateTime(s.endsAt) : 'no end'}
                    </small>
                    <div className="cell-sub">order {s.position}</div>
                  </td>
                  <td>{compact(s.impressions)}</td>
                  <td>
                    {compact(s.clicks)}
                    <div className="cell-sub">{s.ctr}% CTR</div>
                  </td>
                  <td>
                    <span className={`pill ${SPONSOR_PILL[s.status] ?? ''}`}>{SPONSOR_LABEL[s.status] || s.status}</span>
                  </td>
                  <td>
                    <div className="actions camp-row-actions">
                      {sponsorActions(s).map(([action, label]) => (
                        <button key={action} type="button" className={`btn btn-sm ${action === 'publish' || action === 'resume' ? 'btn-gold' : 'btn-ghost'}`} onClick={() => changeState(s, action)}>
                          {label}
                        </button>
                      ))}
                      <button className="ibtn" type="button" onClick={() => setPreviewFor(s)} title="Preview" aria-label={`Preview ${s.sponsor}`}>
                        <Eye />
                      </button>
                      <button className="ibtn" type="button" onClick={() => edit(s)} title="Edit" aria-label={`Edit ${s.sponsor}`}>
                        <Pencil />
                      </button>
                      <button className="ibtn" type="button" onClick={() => setStatsFor(s)} title="View stats" aria-label={`Stats for ${s.sponsor}`}>
                        <BarChart3 />
                      </button>
                      <button className="ibtn danger" type="button" onClick={() => remove(s)} title="Delete" aria-label={`Delete ${s.sponsor}`}>
                        <Trash2 />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Async>
      </Panel>

      {previewFor && (
        <div className="video-preview-overlay adpv-overlay" role="dialog" aria-modal="true" aria-label={`Preview ${previewFor.sponsor}`}>
          <div className="video-preview-backdrop" onClick={() => setPreviewFor(null)} aria-hidden="true" />
          <div className="video-preview-dialog">
            <button className="modal-x" onClick={() => setPreviewFor(null)} aria-label="Close preview">
              <X />
            </button>
            <div className="preview-head">
              <b>Preview · {previewFor.sponsor}</b>
              <small>{SPONSOR_LABEL[previewFor.status]} · exactly as the homepage shows it</small>
            </div>
            <SponsorPreview banner={{ sponsor: previewFor.sponsor, title: previewFor.title, tagline: previewFor.tagline, cta: previewFor.cta, imageSrc: previewFor.imageUrl }} />
          </div>
        </div>
      )}
      <SponsorStats sponsor={statsFor} onClose={() => setStatsFor(null)} />
    </div>
  )
}

