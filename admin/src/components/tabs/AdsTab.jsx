import { useState } from 'react'
import { Megaphone, Plus, Upload } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import { StatGrid } from '@/components/ui/StatCard'
import { TableWrap, EmptyRow, IconButton } from '@/components/ui/Table'
import { Async } from '@/components/ui/States'
import useApi, { tzs, compact, shortDate } from '@/hooks/useApi'
import api from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { useConfirm } from '@/context/ConfirmContext'
import { useToast } from '@/context/ToastContext'

/**
 * Advertising on Free + Ads videos.
 *
 * A campaign is only real once it can be served, so everything the selection
 * logic reads is editable here: the advert itself, the window it runs in, the
 * placements it may take, and who it may run against. The figures are counted
 * from impressions actually delivered — a campaign with no impressions shows
 * zero, which is the useful thing to know about it.
 */

const PLACEMENTS = [
  ['pre_roll', 'Pre-roll', 'Before the video starts'],
  ['mid_roll', 'Mid-roll', 'Part way through longer videos'],
  ['post_roll', 'Post-roll', 'After the video ends'],
]

const BLANK = {
  name: '',
  advertiser: '',
  cpmTzs: 25000,
  startsAt: '',
  endsAt: '',
  placements: ['pre_roll'],
  targetCategories: [],
  skipAfterSeconds: 5,
  notes: '',
}

/** `datetime-local` gives no timezone; the API wants a real instant. */
const toInstant = (local) => (local ? new Date(local).toISOString() : null)

export default function AdsTab() {
  const showToast = useToast()
  const confirm = useConfirm()
  const { isAdmin } = useAuth()

  const { data, loading, error, reload } = useApi(() => api.admin.ads(), [])
  const settings = useApi(() => api.admin.settings(), [])

  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(null)

  const campaigns = data?.campaigns || []
  const categories = data?.options?.categories || []
  const s = data?.stats

  const stats = [
    { icon: 'eye', label: 'Impressions (30d)', value: compact(s?.impressions) },
    { icon: 'coins', tone: 'gold', label: 'Ad Revenue (30d)', value: tzs(s?.revenueTzs) },
    { icon: 'users', label: 'Paid to Creators (30d)', value: tzs(s?.creatorTzs) },
    { icon: 'clapperboard', label: 'Videos Showing Ads', value: compact(s?.videosWithAds) },
  ]

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const togglePlacement = (key) =>
    setForm((f) => ({
      ...f,
      placements: f.placements.includes(key)
        ? f.placements.filter((p) => p !== key)
        : [...f.placements, key],
    }))

  const toggleCategory = (cat) =>
    setForm((f) => ({
      ...f,
      targetCategories: f.targetCategories.includes(cat)
        ? f.targetCategories.filter((c) => c !== cat)
        : [...f.targetCategories, cat],
    }))

  const create = async (e) => {
    e.preventDefault()
    if (!form.placements.length) return showToast('Choose at least one placement')

    setBusy(true)
    try {
      const { campaign } = await api.admin.createCampaign({
        name: form.name.trim(),
        advertiser: form.advertiser.trim() || undefined,
        cpmTzs: Number(form.cpmTzs) || 0,
        startsAt: toInstant(form.startsAt),
        endsAt: toInstant(form.endsAt),
        placements: form.placements,
        targetCategories: form.targetCategories,
        skipAfterSeconds: Number(form.skipAfterSeconds) || 0,
        notes: form.notes.trim() || undefined,
      })
      showToast(`"${campaign.name}" created — now upload its advert`)
      setForm(BLANK)
      setCreating(false)
      reload({ quiet: true })
    } catch (err) {
      showToast(err.message)
    } finally {
      setBusy(false)
    }
  }

  /**
   * Send the advert to Cloudflare, not through this server.
   *
   * The same route a creator's upload takes: the API hands back a one-time
   * destination and the browser puts the file there directly.
   */
  const uploadAdvert = async (campaign, file) => {
    if (!file) return
    setUploading(campaign.id)
    try {
      const { uploadUrl } = await api.admin.adUploadTicket(campaign.id)

      const body = new FormData()
      body.append('file', file)
      const res = await fetch(uploadUrl, { method: 'POST', body })
      if (!res.ok) throw new Error('Cloudflare rejected the upload')

      showToast('Advert uploaded — it takes a moment to encode')

      // Duration only exists once encoding finishes, and the skip timing needs it.
      let attempts = 0
      const poll = async () => {
        attempts += 1
        const media = await api.admin.adMedia(campaign.id).catch(() => null)
        if (media?.state === 'ready') {
          showToast(`"${campaign.name}" is ready to serve`)
          reload({ quiet: true })
          return
        }
        if (attempts < 20) setTimeout(poll, 4000)
        else reload({ quiet: true })
      }
      setTimeout(poll, 4000)
      reload({ quiet: true })
    } catch (err) {
      showToast(err.message)
    } finally {
      setUploading(null)
    }
  }

  const toggle = async (c) => {
    try {
      await api.admin.updateCampaign(c.id, { active: !c.active })
      showToast(c.active ? `"${c.name}" paused` : `"${c.name}" is running`)
      reload({ quiet: true })
    } catch (err) {
      showToast(err.message)
    }
  }

  const editCpm = (c) => {
    const answer = window.prompt(
      `What does ${c.advertiser || c.name} pay per thousand impressions, in TZS?`,
      String(c.cpmTzs)
    )
    if (answer === null) return
    const value = Number(answer.replace(/[^\d]/g, ''))
    if (!Number.isFinite(value) || value < 0) return showToast('Enter a number')
    api.admin
      .updateCampaign(c.id, { cpmTzs: value })
      .then(() => {
        showToast(`CPM set to ${tzs(value)}`)
        reload({ quiet: true })
      })
      .catch((err) => showToast(err.message))
  }

  const remove = (c) =>
    confirm({
      title: `Delete "${c.name}"?`,
      text:
        'The campaign stops serving immediately. Impressions already recorded are kept — ' +
        'they are the record behind revenue creators have already been credited.',
      onConfirm: async () => {
        try {
          await api.admin.deleteCampaign(c.id)
          showToast('Campaign deleted')
          reload({ quiet: true })
        } catch (err) {
          showToast(err.message)
        }
      },
    })

  const toggleSetting = async (key, next) => {
    try {
      await api.admin.updateSettings({ [key]: next })
      settings.reload({ quiet: true })
      showToast('Saved')
    } catch (err) {
      showToast(err.message)
    }
  }

  const ps = settings.data?.settings
  const AD_TOGGLES = [
    ['preroll_enabled', 'Pre-roll ads', 'Shown before a Free + Ads video starts'],
    ['midroll_enabled', 'Mid-roll ads', 'Part way through videos long enough to have a middle'],
    ['postroll_enabled', 'Post-roll ads', 'Shown after the video ends'],
    ['ads_on_expired_premieres', 'Ads once a premiere ends', 'When the paid window on a video closes'],
    ['share_ad_revenue', 'Share ad revenue with creators', 'Uses the same split as sales'],
  ]

  const STATUS_PILL = { live: 'ok', paused: '', scheduled: 'info', ended: '', 'no video': 'pend' }

  return (
    <div className="tab">
      <StatGrid stats={stats} />

      <Panel title="Where ads may run">
        <Async loading={settings.loading} error={settings.error} onRetry={settings.reload} rows={3}>
          {ps && (
            <>
              {AD_TOGGLES.map(([key, title, note]) => (
                <div className="toggle-row" key={key}>
                  <div>
                    <b>{title}</b>
                    <small>{note}</small>
                  </div>
                  <button
                    type="button"
                    className={`switch ${ps[key] ? 'on' : ''}`.trim()}
                    role="switch"
                    aria-checked={Boolean(ps[key])}
                    aria-label={title}
                    disabled={!isAdmin}
                    onClick={() => toggleSetting(key, !ps[key])}
                  />
                </div>
              ))}
              <div className="toggle-row">
                <div>
                  <b>Skip allowed after</b>
                  <small>The default; a campaign may set its own</small>
                </div>
                <b style={{ color: 'var(--gold)' }}>{ps.preroll_skip_after_secs}s</b>
              </div>
              <div className="toggle-row">
                <div>
                  <b>Mid-roll only on videos longer than</b>
                  <small>Shorter videos never carry one</small>
                </div>
                <b style={{ color: 'var(--gold)' }}>
                  {Math.round((ps.midroll_after_secs || 0) / 60)} min
                </b>
              </div>
              {!isAdmin && (
                <p className="field-note">
                  These are changed by an administrator. You can still run campaigns.
                </p>
              )}
            </>
          )}
        </Async>
      </Panel>

      <Panel
        title="Ad Campaigns"
        action={
          <button className="btn btn-purple btn-sm" onClick={() => setCreating((v) => !v)}>
            <Plus />
            {creating ? 'Cancel' : 'New Campaign'}
          </button>
        }
      >
        {creating && (
          <form onSubmit={create} className="camp-form">
            <div className="invite-grid">
              <div className="field">
                <label htmlFor="camp-name">Campaign name</label>
                <div className="input-wrap">
                  <input
                    id="camp-name"
                    value={form.name}
                    onChange={(e) => set({ name: e.target.value })}
                    placeholder="Vodacom Tanzania — June"
                    required
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="camp-adv">Advertiser</label>
                <div className="input-wrap">
                  <input
                    id="camp-adv"
                    value={form.advertiser}
                    onChange={(e) => set({ advertiser: e.target.value })}
                    placeholder="Vodacom Tanzania"
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="camp-cpm">CPM (TZS)</label>
                <div className="input-wrap">
                  <input
                    id="camp-cpm"
                    type="number"
                    min={0}
                    value={form.cpmTzs}
                    onChange={(e) => set({ cpmTzs: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="invite-grid">
              <div className="field">
                <label htmlFor="camp-from">Runs from</label>
                <div className="input-wrap">
                  <input
                    id="camp-from"
                    type="datetime-local"
                    value={form.startsAt}
                    onChange={(e) => set({ startsAt: e.target.value })}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="camp-to">Runs until</label>
                <div className="input-wrap">
                  <input
                    id="camp-to"
                    type="datetime-local"
                    value={form.endsAt}
                    onChange={(e) => set({ endsAt: e.target.value })}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="camp-skip">Skip after (seconds)</label>
                <div className="input-wrap">
                  <input
                    id="camp-skip"
                    type="number"
                    min={0}
                    max={120}
                    value={form.skipAfterSeconds}
                    onChange={(e) => set({ skipAfterSeconds: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="camp-block">
              <b>Placement</b>
              <div className="rv-presets">
                {PLACEMENTS.map(([key, label, note]) => (
                  <button
                    key={key}
                    type="button"
                    title={note}
                    className={`rv-preset ${form.placements.includes(key) ? 'on' : ''}`.trim()}
                    onClick={() => togglePlacement(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="camp-block">
              <b>Show it on</b>
              <div className="rv-presets">
                {categories.length === 0 && (
                  <span className="field-note" style={{ margin: 0 }}>
                    No categories on the platform yet — this campaign will run on every eligible
                    video.
                  </span>
                )}
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={`rv-preset ${form.targetCategories.includes(cat) ? 'on' : ''}`.trim()}
                    onClick={() => toggleCategory(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <p className="field-note">
                Pick nothing and it runs on every Free + Ads video. Picking categories narrows it
                to those.
              </p>
            </div>

            <div className="field">
              <label htmlFor="camp-notes">Notes</label>
              <div className="input-wrap">
                <input
                  id="camp-notes"
                  value={form.notes}
                  onChange={(e) => set({ notes: e.target.value })}
                  placeholder="Anything the next person needs to know"
                />
              </div>
            </div>

            <button className="btn btn-gold" type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create campaign'}
            </button>
            <p className="field-note">
              CPM is what the advertiser pays per thousand impressions served. Once created, upload
              the advert against the campaign — it cannot serve without one.
            </p>
          </form>
        )}

        <Async
          loading={loading}
          error={error}
          onRetry={reload}
          empty={!campaigns.length}
          rows={3}
          emptyProps={{
            icon: Megaphone,
            title: 'No campaigns yet',
            hint: 'Create one above, upload its advert, and it starts serving on Free + Ads videos.',
          }}
        >
          <TableWrap>
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Advert</th>
                <th>Placement</th>
                <th>Window</th>
                <th>CPM</th>
                <th>Impressions</th>
                <th>Revenue</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 && <EmptyRow colSpan={9}>No campaigns yet.</EmptyRow>}
              {campaigns.map((c) => {
                const perf = c.performance || {}
                return (
                  <tr key={c.id}>
                    <td>
                      <b>{c.name}</b>
                      {c.advertiser && <div className="cell-sub">{c.advertiser}</div>}
                      {c.targetCategories?.length > 0 && (
                        <div className="cell-sub">→ {c.targetCategories.join(', ')}</div>
                      )}
                    </td>
                    <td>
                      {c.hasVideo ? (
                        <span className="pill ok">
                          {c.durationSeconds ? `${c.durationSeconds}s` : 'uploaded'}
                        </span>
                      ) : (
                        <label className="ad-upload">
                          <input
                            type="file"
                            accept="video/*"
                            onChange={(e) => uploadAdvert(c, e.target.files?.[0])}
                          />
                          <Upload size={13} />
                          {uploading === c.id ? 'Uploading…' : 'Upload'}
                        </label>
                      )}
                    </td>
                    <td>
                      {(c.placements || []).map((p) => (
                        <span className="pill info" key={p} style={{ marginRight: 4 }}>
                          {p.replace('_roll', '')}
                        </span>
                      ))}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {c.startsAt || c.endsAt ? (
                        <>
                          {c.startsAt ? shortDate(c.startsAt) : 'now'}
                          {' → '}
                          {c.endsAt ? shortDate(c.endsAt) : 'open'}
                        </>
                      ) : (
                        <span style={{ color: 'var(--muted)' }}>always</span>
                      )}
                    </td>
                    <td>{tzs(c.cpmTzs)}</td>
                    <td>
                      {compact(perf.impressions)}
                      {perf.completed != null && perf.impressions > 0 && (
                        <div className="cell-sub">{compact(perf.completed)} completed</div>
                      )}
                    </td>
                    <td className="money">
                      {tzs(perf.revenueTzs)}
                      {perf.creatorTzs > 0 && (
                        <div className="cell-sub">{tzs(perf.creatorTzs)} to creators</div>
                      )}
                    </td>
                    <td>
                      <button
                        className={`pill ${STATUS_PILL[c.status] ?? ''}`}
                        style={{ cursor: 'pointer', border: 0 }}
                        onClick={() => toggle(c)}
                        title={c.active ? 'Pause this campaign' : 'Start this campaign'}
                      >
                        {c.status}
                      </button>
                    </td>
                    <td>
                      <div className="actions">
                        <IconButton icon="percent" title="Change CPM" onClick={() => editCpm(c)} />
                        {isAdmin && (
                          <IconButton
                            icon="trash-2"
                            tone="danger"
                            title={`Delete ${c.name}`}
                            onClick={() => remove(c)}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </TableWrap>
        </Async>
      </Panel>
    </div>
  )
}
