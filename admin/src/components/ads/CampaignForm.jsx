import { useState } from 'react'
import { Save, Send } from 'lucide-react'

/**
 * Every field of a campaign, for creating one and for editing it (client,
 * 2026-11-17): advertiser / sponsor name, campaign name, destination URL,
 * start and end date, placement, skip time, CPM, impression cap, targeting.
 *
 * A new campaign is saved as a Draft (to upload and preview the advert first)
 * or published straight away; an existing one is saved in place.
 */

export const PLACEMENTS = [
  ['pre_roll', 'Pre-roll', 'Before the video starts'],
  ['mid_roll', 'Mid-roll', 'Part way through longer videos'],
  ['post_roll', 'Post-roll', 'After the video ends'],
]

/** <input type="datetime-local"> speaks local time with no zone. */
export const toLocalInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
export const toInstant = (local) => (local ? new Date(local).toISOString() : null)

export const BLANK_CAMPAIGN = {
  name: '',
  advertiser: '',
  clickUrl: '',
  cpmTzs: 25000,
  impressionCap: '',
  startsAt: '',
  endsAt: '',
  placements: ['pre_roll'],
  targetCategories: [],
  skippable: true,
  skipAfterSeconds: 5,
  notes: '',
}

export const formFromCampaign = (c) => ({
  name: c.name || '',
  advertiser: c.advertiser || '',
  clickUrl: c.clickUrl || '',
  cpmTzs: c.cpmTzs ?? 0,
  impressionCap: c.impressionCap ? String(c.impressionCap) : '',
  startsAt: toLocalInput(c.startsAt),
  endsAt: toLocalInput(c.endsAt),
  placements: c.placements?.length ? c.placements : ['pre_roll'],
  targetCategories: c.targetCategories || [],
  skippable: Number(c.skipAfterSeconds) > 0,
  skipAfterSeconds: Number(c.skipAfterSeconds) > 0 ? c.skipAfterSeconds : 5,
  notes: c.notes || '',
})

/** Pure: the form as the API wants it, or the first thing to fix. */
export function campaignBody(form) {
  if (form.name.trim().length < 2) return { error: 'Give the campaign a name (2 characters or more).' }
  if (!form.placements.length) return { error: 'Choose at least one placement.' }
  const url = form.clickUrl.trim()
  if (url && !/^https?:\/\/[^\s/]+\.[^\s]+/i.test(url)) return { error: 'The destination must be a full web address, starting with https://' }
  const startsAt = toInstant(form.startsAt)
  const endsAt = toInstant(form.endsAt)
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) return { error: 'The end date must be after the start date.' }
  const cap = form.impressionCap === '' ? null : Math.round(Number(form.impressionCap))
  if (cap !== null && (!Number.isFinite(cap) || cap < 1)) return { error: 'The impression cap must be a whole number, or empty for no cap.' }
  return {
    body: {
      name: form.name.trim(),
      advertiser: form.advertiser.trim() || undefined,
      clickUrl: url,
      cpmTzs: Math.max(0, Math.round(Number(form.cpmTzs) || 0)),
      impressionCap: cap,
      startsAt,
      endsAt,
      placements: form.placements,
      targetCategories: form.targetCategories,
      skipAfterSeconds: form.skippable ? Math.min(120, Math.max(1, Math.round(Number(form.skipAfterSeconds) || 5))) : 0,
      notes: form.notes.trim() || undefined,
    },
  }
}

export default function CampaignForm({ initial = BLANK_CAMPAIGN, categories = [], editing = false, busy = false, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial)
  const [error, setError] = useState(null)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const toggleIn = (key, value) =>
    setForm((f) => ({ ...f, [key]: f[key].includes(value) ? f[key].filter((x) => x !== value) : [...f[key], value] }))

  const submit = (mode) => (e) => {
    e?.preventDefault?.()
    const { body, error: problem } = campaignBody(form)
    setError(problem || null)
    if (problem) return
    onSubmit(body, mode)
  }

  const id = (k) => `camp-${editing ? 'edit' : 'new'}-${k}`

  return (
    <form onSubmit={submit(editing ? 'save' : 'publish')} className="camp-form" noValidate>
      <div className="camp-grid">
        <div className="field">
          <label htmlFor={id('adv')}>Advertiser / sponsor</label>
          <div className="input-wrap">
            <input id={id('adv')} value={form.advertiser} maxLength={120} onChange={(e) => set({ advertiser: e.target.value })} placeholder="Vodacom Tanzania" />
          </div>
        </div>
        <div className="field">
          <label htmlFor={id('name')}>Campaign name</label>
          <div className="input-wrap">
            <input id={id('name')} value={form.name} maxLength={120} required onChange={(e) => set({ name: e.target.value })} placeholder="Vodacom — December data" />
          </div>
        </div>
        <div className="field camp-wide">
          <label htmlFor={id('url')}>Destination URL (the “Learn more” button)</label>
          <div className="input-wrap">
            <input id={id('url')} type="url" value={form.clickUrl} maxLength={500} onChange={(e) => set({ clickUrl: e.target.value })} placeholder="https://advertiser.co.tz/offer — leave empty for a watch-only ad" />
          </div>
        </div>
        <div className="field">
          <label htmlFor={id('from')}>Start date</label>
          <div className="input-wrap">
            <input id={id('from')} type="datetime-local" value={form.startsAt} onChange={(e) => set({ startsAt: e.target.value })} />
          </div>
          <small className="field-hint">Empty = as soon as it is published</small>
        </div>
        <div className="field">
          <label htmlFor={id('to')}>End date</label>
          <div className="input-wrap">
            <input id={id('to')} type="datetime-local" value={form.endsAt} onChange={(e) => set({ endsAt: e.target.value })} />
          </div>
          <small className="field-hint">Empty = runs until you end it</small>
        </div>
        <div className="field">
          <label htmlFor={id('cpm')}>CPM / rate (TZS per 1,000 impressions)</label>
          <div className="input-wrap">
            <input id={id('cpm')} type="number" min={0} value={form.cpmTzs} onChange={(e) => set({ cpmTzs: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label htmlFor={id('cap')}>Impression cap</label>
          <div className="input-wrap">
            <input id={id('cap')} type="number" min={1} value={form.impressionCap} onChange={(e) => set({ impressionCap: e.target.value })} placeholder="No cap" />
          </div>
          <small className="field-hint">Stops serving once this many impressions are delivered</small>
        </div>
      </div>

      <div className="camp-block">
        <b>Placement</b>
        <div className="rv-presets">
          {PLACEMENTS.map(([key, label, note]) => (
            <button key={key} type="button" title={note} aria-pressed={form.placements.includes(key)} className={`rv-preset ${form.placements.includes(key) ? 'on' : ''}`.trim()} onClick={() => toggleIn('placements', key)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="camp-block">
        <b>Skip time</b>
        <div className="camp-skip">
          <label className="check-row" htmlFor={id('skippable')}>
            <input id={id('skippable')} type="checkbox" checked={form.skippable} onChange={(e) => set({ skippable: e.target.checked })} />
            <span>Skippable</span>
          </label>
          {form.skippable && (
            <div className="input-wrap camp-skip-secs">
              <input id={id('skip')} type="number" min={1} max={120} value={form.skipAfterSeconds} onChange={(e) => set({ skipAfterSeconds: e.target.value })} aria-label="Seconds before Skip appears" />
              <span className="field-suffix">sec before Skip</span>
            </div>
          )}
          {!form.skippable && <small className="field-hint">The viewer must watch the whole advert</small>}
        </div>
      </div>

      <div className="camp-block">
        <b>Show it on</b>
        <div className="rv-presets">
          {categories.length === 0 && <span className="field-note" style={{ margin: 0 }}>No categories yet — it runs on every Free + Ads video.</span>}
          {categories.map((cat) => (
            <button key={cat} type="button" aria-pressed={form.targetCategories.includes(cat)} className={`rv-preset ${form.targetCategories.includes(cat) ? 'on' : ''}`.trim()} onClick={() => toggleIn('targetCategories', cat)}>
              {cat}
            </button>
          ))}
        </div>
        <p className="field-note">Pick nothing and it runs on every Free + Ads video.</p>
      </div>

      <div className="field">
        <label htmlFor={id('notes')}>Notes (only staff see these)</label>
        <div className="input-wrap">
          <input id={id('notes')} value={form.notes} maxLength={1000} onChange={(e) => set({ notes: e.target.value })} placeholder="Anything the next person needs to know" />
        </div>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="camp-actions">
        {editing ? (
          <button className="btn btn-gold" type="submit" disabled={busy}>
            <Save size={16} /> {busy ? 'Saving…' : 'Save changes'}
          </button>
        ) : (
          <>
            <button className="btn btn-ghost" type="button" disabled={busy} onClick={submit('draft')}>
              <Save size={16} /> {busy ? 'Saving…' : 'Save as draft'}
            </button>
            <button className="btn btn-gold" type="submit" disabled={busy}>
              <Send size={16} /> {busy ? 'Saving…' : form.startsAt && new Date(form.startsAt) > new Date() ? 'Create & schedule' : 'Create & publish'}
            </button>
          </>
        )}
        {onCancel && (
          <button className="btn btn-ghost" type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      {!editing && (
        <p className="field-note">
          Save as draft to upload the advert and preview it on desktop and mobile first. A published campaign only starts serving once its advert is uploaded.
        </p>
      )}
    </form>
  )
}
