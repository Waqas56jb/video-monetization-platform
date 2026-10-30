import { useRef, useState } from 'react'
import { ImagePlus, Megaphone, Pencil, Trash2 } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Field from '@/components/ui/Field'
import { StatGrid } from '@/components/ui/StatCard'
import { TableWrap } from '@/components/ui/Table'
import { Async } from '@/components/ui/States'
import useApi, { compact, dateTime } from '@/hooks/useApi'
import api from '@/lib/api'
import { sponsorImageProblem } from '@/lib/sponsorImage'
import { useToast } from '@/context/ToastContext'
import { useConfirm } from '@/context/ConfirmContext'

/**
 * Homepage sponsors (Milestone 3).
 *
 * Banners shown at the top of the homepage, in the order set here, only while
 * switched on and inside their dates — at most five at a time. A click goes
 * through MTONYO+ so it is counted, then on to the sponsor's address.
 */

const EMPTY = { sponsor: '', title: '', tagline: '', cta: '', clickUrl: 'https://', active: true, startsAt: '', endsAt: '', position: 0 }

// <input type="datetime-local"> speaks local time without a zone.
const toLocalInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null)

export default function SponsorsTab() {
  const showToast = useToast()
  const confirm = useConfirm()
  const { data, loading, error, reload } = useApi(() => api.admin.sponsors(), [], { refetchOnFocus: true })
  const sponsors = data?.sponsors || []

  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState(null) // id or null
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const [image, setImage] = useState(null)
  const fileRef = useRef(null)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const reset = () => {
    setForm(EMPTY)
    setEditing(null)
    setImage(null)
    setFormError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const edit = (s) => {
    setEditing(s.id)
    setForm({ sponsor: s.sponsor, title: s.title, tagline: s.tagline || '', cta: s.cta || '', clickUrl: s.clickUrl, active: s.active, startsAt: toLocalInput(s.startsAt), endsAt: toLocalInput(s.endsAt), position: s.position })
    setImage(null)
    setFormError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const save = async (e) => {
    e.preventDefault()
    setFormError(null)
    const body = { ...form, position: Number(form.position) || 0, startsAt: fromLocalInput(form.startsAt), endsAt: fromLocalInput(form.endsAt), tagline: form.tagline || null, cta: form.cta || null }
    if (body.startsAt && body.endsAt && new Date(body.endsAt) <= new Date(body.startsAt)) return setFormError('The end date must be after the start date.')
    if (!/^https?:\/\/[^\s/]+\.[^\s]+/.test(body.clickUrl)) return setFormError('Enter the full web address the banner opens, starting with https://')
    const imageError = sponsorImageProblem(image)
    if (imageError) return setFormError(imageError)
    setSaving(true)
    try {
      const res = editing ? await api.admin.updateSponsor(editing, body) : await api.admin.createSponsor(body)
      if (image) {
        try {
          await api.admin.sponsorImage(res.sponsor.id, image)
        } catch (err) {
          // The sponsor is saved. Stay on it, so trying again edits it
          // rather than adding a second one.
          setEditing(res.sponsor.id)
          setImage(null)
          if (fileRef.current) fileRef.current.value = ''
          setFormError(`Saved, but the image did not upload (${err.message}). Choose the image again and press Save changes.`)
          reload({ quiet: true })
          return
        }
      }
      showToast(editing ? 'Sponsor updated' : 'Sponsor added to the homepage')
      reset()
      reload({ quiet: true })
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (s) => {
    try {
      await api.admin.updateSponsor(s.id, { sponsor: s.sponsor, title: s.title, tagline: s.tagline, cta: s.cta, clickUrl: s.clickUrl, active: !s.active, startsAt: s.startsAt, endsAt: s.endsAt, position: s.position })
      showToast(s.active ? `"${s.sponsor}" is off the homepage` : `"${s.sponsor}" is back on`)
      reload({ quiet: true })
    } catch (err) {
      showToast(err.message)
    }
  }

  const remove = (s) =>
    confirm({
      title: 'Remove this sponsor?',
      text: `"${s.sponsor}" leaves the homepage and its numbers (${compact(s.impressions)} views, ${compact(s.clicks)} clicks) are deleted.`,
      onConfirm: async () => {
        try {
          await api.admin.deleteSponsor(s.id)
          showToast('Sponsor removed')
          if (editing === s.id) reset()
          reload({ quiet: true })
        } catch (err) {
          showToast(err.message)
        }
      },
    })

  const live = sponsors.filter((s) => s.live)
  const stats = [
    { icon: 'megaphone', label: 'Live on the homepage', value: `${live.length} / ${data?.maxLive ?? 5}` },
    { icon: 'eye', label: 'Banner views', value: compact(sponsors.reduce((n, s) => n + s.impressions, 0)) },
    { icon: 'mouse-pointer-click', label: 'Clicks', value: compact(sponsors.reduce((n, s) => n + s.clicks, 0)) },
  ]

  return (
    <div className="tab">
      <StatGrid stats={stats} />

      <Panel title={editing ? 'Edit sponsor' : 'Add a homepage sponsor'} action={editing && <button className="btn btn-ghost btn-sm" onClick={reset}>Cancel edit</button>}>
        <form className="form-grid" onSubmit={save} noValidate>
          <Field id="sp-sponsor" label="Sponsor name" icon="landmark" maxLength={80} required value={form.sponsor} onChange={set('sponsor')} placeholder="Vodacom Tanzania" />
          <Field id="sp-title" label="Headline" icon="megaphone" maxLength={80} required value={form.title} onChange={set('title')} placeholder="Unlimited data weekends" />
          <Field id="sp-tagline" label="Line under the headline (optional)" icon="mail" maxLength={160} value={form.tagline} onChange={set('tagline')} placeholder="Stream every MTONYO+ release with no worries" />
          <Field id="sp-cta" label="Button text (optional)" icon="mouse-pointer-click" maxLength={30} value={form.cta} onChange={set('cta')} placeholder="Learn more" />
          <Field id="sp-url" label="Opens this address" icon="log-in" type="url" maxLength={500} required value={form.clickUrl} onChange={set('clickUrl')} />
          <Field id="sp-pos" label="Order (lower shows first)" icon="layout-dashboard" type="number" min={0} max={999} value={form.position} onChange={set('position')} />
          <Field id="sp-start" label="Starts (optional)" icon="hourglass" type="datetime-local" value={form.startsAt} onChange={set('startsAt')} />
          <Field id="sp-end" label="Ends (optional)" icon="hourglass" type="datetime-local" value={form.endsAt} onChange={set('endsAt')} />
          <div className="field">
            <label htmlFor="sp-image">Banner image (JPEG, PNG or WebP, up to 5 MB — wide, about 1200 × 400)</label>
            <input id="sp-image" ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setImage(e.target.files?.[0] || null)} />
          </div>
          <label className="check-row">
            <input type="checkbox" checked={form.active} onChange={set('active')} /> Show on the homepage
          </label>
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <button className="btn btn-gold" type="submit" disabled={saving || !form.sponsor.trim() || !form.title.trim()} style={{ width: 'fit-content' }}>
            <ImagePlus size={16} />
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add sponsor'}
          </button>
        </form>
      </Panel>

      <Panel title="Sponsors">
        <Async loading={loading} error={error} onRetry={reload} empty={!sponsors.length} rows={3}
          emptyProps={{ icon: Megaphone, title: 'No sponsors yet', hint: 'Add one above and it appears at the top of the homepage.' }}>
          <TableWrap>
            <thead>
              <tr><th>Banner</th><th>Sponsor</th><th>Dates</th><th>Views</th><th>Clicks</th><th>CTR</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {sponsors.map((s) => (
                <tr key={s.id}>
                  <td>{s.imageUrl ? <img src={s.imageUrl} alt="" style={{ width: 96, height: 32, objectFit: 'cover', borderRadius: 6 }} /> : <small style={{ opacity: 0.6 }}>text only</small>}</td>
                  <td><b>{s.sponsor}</b><br /><small style={{ opacity: 0.7 }}>{s.title}</small></td>
                  <td><small>{s.startsAt ? dateTime(s.startsAt) : 'now'} → {s.endsAt ? dateTime(s.endsAt) : 'no end'}</small></td>
                  <td>{compact(s.impressions)}</td>
                  <td>{compact(s.clicks)}</td>
                  <td>{s.ctr}%</td>
                  <td>
                    <button className={`pill ${s.live ? 'ok' : s.active ? 'pend' : ''}`} onClick={() => toggle(s)} title={s.active ? 'Switch off' : 'Switch on'}>
                      {s.live ? 'live' : s.active ? 'scheduled / ended' : 'off'}
                    </button>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => edit(s)} aria-label={`Edit ${s.sponsor}`}><Pencil size={14} /></button>
                    <button className="btn btn-ghost btn-sm" onClick={() => remove(s)} aria-label={`Remove ${s.sponsor}`}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Async>
      </Panel>
    </div>
  )
}
