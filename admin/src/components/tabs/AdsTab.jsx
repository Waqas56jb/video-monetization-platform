import { Fragment, useState } from 'react'
import { Megaphone, Plus, Upload } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import { StatGrid } from '@/components/ui/StatCard'
import { TableWrap, IconButton } from '@/components/ui/Table'
import { Async } from '@/components/ui/States'
import CampaignForm, { formFromCampaign } from '@/components/ads/CampaignForm'
import AdPreview from '@/components/ads/AdPreview'
import useApi, { tzs, compact, shortDate, timeAgo } from '@/hooks/useApi'
import api from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { useConfirm } from '@/context/ConfirmContext'
import { useToast } from '@/context/ToastContext'

/**
 * Ads Management: the control center for adverts on Free + Ads videos
 * (client, 2026-11-17, point 5).
 *
 * Every campaign shows its creative and a desktop / mobile preview, the
 * advertiser, name, destination, dates, status (Draft / Scheduled / Live /
 * Paused / Ended), placement, skip time, CPM, impression cap, and what it has
 * delivered: impressions, completed views, clicks / CTR, revenue and the
 * creators' share. Edit, pause, resume, end and delete are one click each.
 * The figures are counted from impressions actually delivered.
 */

export const STATUS_PILL = { live: 'ok', scheduled: 'info', draft: 'free', paused: 'pend', ended: '', 'no video': 'bad' }
export const STATUS_LABEL = { live: 'Live', scheduled: 'Scheduled', draft: 'Draft', paused: 'Paused', ended: 'Ended', 'no video': 'Needs advert' }

/** The state buttons a campaign offers, from the state the admin chose. */
export function campaignActions(c) {
  const out = []
  if (c.state === 'draft') out.push(['publish', 'send', c.startsAt && new Date(c.startsAt) > new Date() ? 'Schedule' : 'Publish'])
  if (c.state === 'active' && c.status !== 'ended') out.push(['pause', 'pause', 'Pause'])
  if (c.state === 'paused' && c.status !== 'ended') out.push(['resume', 'play', 'Resume'])
  // An already-ended campaign (by date or cap) has nothing left to end.
  if (c.state !== 'ended' && c.status !== 'ended') out.push(['end', 'square', 'End'])
  return out
}

export default function AdsTab() {
  const showToast = useToast()
  const confirm = useConfirm()
  const { isAdmin } = useAuth()

  const { data, loading, error, reload } = useApi(() => api.admin.ads(), [])
  const settings = useApi(() => api.admin.settings(), [])

  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [previewing, setPreviewing] = useState(null)
  const [filter, setFilter] = useState('all')

  // Per-campaign "view by video": fetched on demand.
  const [videoReportId, setVideoReportId] = useState(null)
  const [videoReport, setVideoReport] = useState(null)
  const [videoReportLoading, setVideoReportLoading] = useState(false)

  const campaigns = data?.campaigns || []
  const categories = data?.options?.categories || []
  const s = data?.stats
  const counts = campaigns.reduce((m, c) => ({ ...m, [c.status]: (m[c.status] || 0) + 1 }), {})
  const shown = filter === 'all' ? campaigns : campaigns.filter((c) => c.status === filter)

  const stats = [
    { icon: 'eye', label: 'Impressions (30d)', value: compact(s?.impressions) },
    { icon: 'coins', tone: 'gold', label: 'Ad Revenue (30d)', value: tzs(s?.revenueTzs) },
    /* Accrued ad-revenue share, not a completed payout. */
    { icon: 'users', label: 'Earned by Creators (30d)', value: tzs(s?.creatorTzs) },
    { icon: 'clapperboard', label: 'Videos Showing Ads', value: compact(s?.videosWithAds) },
  ]

  const create = async (body, mode) => {
    setBusy(true)
    try {
      const { campaign } = await api.admin.createCampaign({ ...body, draft: mode === 'draft' })
      showToast(mode === 'draft' ? `"${campaign.name}" saved as a draft — upload its advert, then preview it` : `"${campaign.name}" created — upload its advert and it starts serving`)
      setCreating(false)
      reload({ quiet: true })
    } catch (err) {
      showToast(err.message)
    } finally {
      setBusy(false)
    }
  }

  const saveEdit = async (c, body) => {
    setBusy(true)
    try {
      await api.admin.updateCampaign(c.id, body)
      showToast(`"${body.name}" updated`)
      setEditingId(null)
      reload({ quiet: true })
    } catch (err) {
      showToast(err.message)
    } finally {
      setBusy(false)
    }
  }

  /** The advert goes straight to Cloudflare, not through this server. */
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
      let attempts = 0
      const poll = async () => {
        attempts += 1
        const media = await api.admin.adMedia(campaign.id).catch(() => null)
        if (media?.state === 'ready') {
          showToast(`"${campaign.name}" is ready — press Preview to watch it`)
          reload({ quiet: true })
          return
        }
        if (attempts < 30) setTimeout(poll, 4000)
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

  const changeState = (c, action) => {
    const run = async () => {
      try {
        await api.admin.campaignState(c.id, action)
        const done = { publish: 'is published', pause: 'is paused', resume: 'is running again', end: 'has ended' }[action]
        showToast(`"${c.name}" ${done}`)
        reload({ quiet: true })
      } catch (err) {
        showToast(err.message)
      }
    }
    if (action !== 'end') return run()
    return confirm({
      title: `End "${c.name}"?`,
      text: 'It stops serving for good. Its numbers stay in the report. To run it again later, create a new campaign.',
      onConfirm: run,
    })
  }

  const toggleVideoReport = async (c) => {
    if (videoReportId === c.id) {
      setVideoReportId(null)
      setVideoReport(null)
      return
    }
    setVideoReportId(c.id)
    setVideoReport(null)
    setVideoReportLoading(true)
    try {
      const res = await api.admin.adVideoReport(c.id)
      setVideoReport(res.videos || [])
    } catch (err) {
      showToast(err.message)
      setVideoReportId(null)
    } finally {
      setVideoReportLoading(false)
    }
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

  /** Save a number-in-minutes field on blur (uncontrolled on purpose). */
  const saveMinutes = (key, min, max) => (e) => {
    const minutes = Number(e.target.value)
    if (!Number.isFinite(minutes)) return
    const secs = Math.min(max, Math.max(min, Math.round(minutes * 60)))
    if (secs === ps?.[key]) return
    toggleSetting(key, secs)
  }
  const saveCount = (key, min, max) => (e) => {
    const n = Math.min(max, Math.max(min, Math.round(Number(e.target.value))))
    if (!Number.isFinite(n) || n === ps?.[key]) return
    toggleSetting(key, n)
  }

  const ps = settings.data?.settings
  const AD_TOGGLES = [
    ['preroll_enabled', 'Pre-roll ads', 'Shown before a Free + Ads video starts'],
    ['midroll_enabled', 'Second ad (mid-roll)', 'Part way through videos long enough to have a middle'],
    ['postroll_enabled', 'Post-roll ads', 'Shown after the video ends'],
    ['ads_on_expired_premieres', 'Ads once a premiere ends', 'When the paid window on a video closes'],
    ['share_ad_revenue', 'Share ad revenue with creators', 'Uses the same split as sales'],
  ]

  const FILTERS = ['all', 'live', 'scheduled', 'draft', 'paused', 'ended', 'no video'].filter((f) => f === 'all' || counts[f])

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
                  <b>Pre-roll target length</b>
                  <small>
                    A creative longer than this auto-completes here (still a genuine, billable
                    delivery) — a shorter one just ends on its own
                  </small>
                </div>
                <div className="ad-mins-field">
                  <input
                    type="number"
                    className="ad-mins-input"
                    min={5}
                    max={60}
                    disabled={!isAdmin}
                    key={`preroll-target-${ps.preroll_target_seconds}`}
                    defaultValue={ps.preroll_target_seconds ?? 10}
                    onBlur={saveCount('preroll_target_seconds', 5, 60)}
                    aria-label="Pre-roll target length, in seconds"
                  />
                  <span className="field-suffix">sec</span>
                </div>
              </div>
              <div className="toggle-row">
                <div>
                  <b>Mid-roll position</b>
                  <small>
                    How far through a video the single mid-roll lands, on any video short enough to
                    get only one
                  </small>
                </div>
                <div className="ad-mins-field">
                  <input
                    type="number"
                    className="ad-mins-input"
                    min={20}
                    max={90}
                    disabled={!isAdmin}
                    key={`midroll-pos-${ps.midroll_position_pct}`}
                    defaultValue={ps.midroll_position_pct ?? 70}
                    onBlur={saveCount('midroll_position_pct', 20, 90)}
                    aria-label="Mid-roll position, as a percentage through the video"
                  />
                  <span className="field-suffix">%</span>
                </div>
              </div>
              <div className="toggle-row">
                <div>
                  <b>Mid-roll only on videos longer than</b>
                  <small>Shorter videos carry a pre-roll only</small>
                </div>
                <div className="ad-mins-field">
                  <input
                    type="number"
                    className="ad-mins-input"
                    min={1}
                    max={120}
                    disabled={!isAdmin}
                    key={`after-${ps.midroll_after_secs}`}
                    defaultValue={Math.round((ps.midroll_after_secs || 0) / 60)}
                    onBlur={saveMinutes('midroll_after_secs', 1, 120)}
                    aria-label="Mid-roll only on videos longer than, in minutes"
                  />
                  <span className="field-suffix">min</span>
                </div>
              </div>
              <div className="toggle-row">
                <div>
                  <b>One mid-roll, up to</b>
                  <small>At this length or above, mid-rolls repeat instead of a single one</small>
                </div>
                <div className="ad-mins-field">
                  <input
                    type="number"
                    className="ad-mins-input"
                    min={1}
                    max={360}
                    disabled={!isAdmin}
                    key={`long-${ps.midroll_long_after_secs}`}
                    defaultValue={Math.round((ps.midroll_long_after_secs || 0) / 60)}
                    onBlur={saveMinutes('midroll_long_after_secs', 1, 360)}
                    aria-label="Videos longer than this repeat mid-rolls, in minutes"
                  />
                  <span className="field-suffix">min</span>
                </div>
              </div>
              <div className="toggle-row">
                <div>
                  <b>Repeat every</b>
                  <small>Spacing between mid-rolls on a long video</small>
                </div>
                <div className="ad-mins-field">
                  <input
                    type="number"
                    className="ad-mins-input"
                    min={1}
                    max={60}
                    disabled={!isAdmin}
                    key={`gap-${ps.midroll_gap_secs}`}
                    defaultValue={Math.round((ps.midroll_gap_secs || 0) / 60)}
                    onBlur={saveMinutes('midroll_gap_secs', 1, 60)}
                    aria-label="Minutes between repeating mid-rolls"
                  />
                  <span className="field-suffix">min</span>
                </div>
              </div>
              <div className="toggle-row">
                <div>
                  <b>Most mid-rolls per play</b>
                  <small>Never more than this, however long the video is</small>
                </div>
                <input
                  type="number"
                  className="ad-mins-input"
                  min={1}
                  max={10}
                  disabled={!isAdmin}
                  key={`max-${ps.midroll_max_count}`}
                  defaultValue={ps.midroll_max_count ?? 3}
                  onBlur={saveCount('midroll_max_count', 1, 10)}
                  aria-label="Maximum mid-rolls per playback"
                />
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
        {creating && <CampaignForm categories={categories} busy={busy} onSubmit={create} onCancel={() => setCreating(false)} />}

        {campaigns.length > 0 && (
          <div className="rv-presets camp-filters" role="tablist" aria-label="Filter campaigns by status">
            {FILTERS.map((f) => (
              <button key={f} type="button" role="tab" aria-selected={filter === f} className={`rv-preset ${filter === f ? 'on' : ''}`.trim()} onClick={() => setFilter(f)}>
                {f === 'all' ? `All (${campaigns.length})` : `${STATUS_LABEL[f]} (${counts[f]})`}
              </button>
            ))}
          </div>
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
            hint: 'Press New Campaign, save it as a draft, upload its advert, preview it, then publish.',
          }}
        >
          <TableWrap>
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Creative</th>
                <th>Placement · skip</th>
                <th>Dates</th>
                <th>CPM · cap</th>
                <th>Delivered</th>
                <th>Clicks · CTR</th>
                <th>Revenue</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => {
                const perf = c.performance || {}
                const capPct = c.impressionCap ? Math.min(100, Math.round(((perf.impressions || 0) / c.impressionCap) * 100)) : null
                return (
                  <Fragment key={c.id}>
                    <tr>
                      <td>
                        <b>{c.name}</b>
                        {c.advertiser && <div className="cell-sub">{c.advertiser}</div>}
                        {c.clickUrl && (
                          <div className="cell-sub camp-url" title={c.clickUrl}>
                            → {c.clickUrl.replace(/^https?:\/\//, '')}
                          </div>
                        )}
                        {c.targetCategories?.length > 0 && <div className="cell-sub">on {c.targetCategories.join(', ')}</div>}
                      </td>
                      <td>
                        {c.hasVideo ? (
                          <div className="camp-creative">
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPreviewing(c)}>
                              <Megaphone size={13} /> Preview
                            </button>
                            <small>{c.durationSeconds ? `${c.durationSeconds}s video` : 'encoding…'}</small>
                            <label className="ad-upload camp-replace">
                              <input type="file" accept="video/*" onChange={(e) => uploadAdvert(c, e.target.files?.[0])} />
                              {uploading === c.id ? 'Uploading…' : 'Replace'}
                            </label>
                          </div>
                        ) : (
                          <label className="ad-upload">
                            <input type="file" accept="video/*" onChange={(e) => uploadAdvert(c, e.target.files?.[0])} />
                            <Upload size={13} />
                            {uploading === c.id ? 'Uploading…' : 'Upload advert'}
                          </label>
                        )}
                      </td>
                      <td>
                        {(c.placements || []).map((p) => (
                          <span className="pill info" key={p} style={{ marginRight: 4 }}>
                            {p.replace('_roll', '-roll')}
                          </span>
                        ))}
                        <div className="cell-sub">{Number(c.skipAfterSeconds) > 0 ? `skip after ${c.skipAfterSeconds}s` : 'not skippable'}</div>
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {c.startsAt ? shortDate(c.startsAt) : 'on publish'} → {c.endsAt ? shortDate(c.endsAt) : 'no end'}
                        {perf.lastServedAt && <div className="cell-sub">last served {timeAgo(perf.lastServedAt)}</div>}
                      </td>
                      <td>
                        {tzs(c.cpmTzs)}
                        <div className="cell-sub">{c.impressionCap ? `cap ${compact(c.impressionCap)}` : 'no cap'}</div>
                      </td>
                      <td>
                        {compact(perf.impressions)} impressions
                        <div className="cell-sub">{compact(perf.completed)} completed views</div>
                        {capPct != null && (
                          <div className="camp-cap" title={`${capPct}% of the cap`}>
                            <span style={{ width: `${capPct}%` }} />
                          </div>
                        )}
                      </td>
                      <td>
                        {c.clickUrl ? (
                          <>
                            {compact(perf.clicks)}
                            <div className="cell-sub">{perf.ctrPercent != null ? `${perf.ctrPercent}% CTR` : 'no impressions yet'}</div>
                          </>
                        ) : (
                          <span style={{ color: 'var(--muted)' }}>watch-only</span>
                        )}
                      </td>
                      <td className="money">
                        {tzs(perf.revenueTzs)}
                        <div className="cell-sub">creators {tzs(perf.creatorTzs)}</div>
                        <div className="cell-sub">MTONYO+ {tzs(perf.platformTzs)}</div>
                      </td>
                      <td>
                        <span className={`pill ${STATUS_PILL[c.status] ?? ''}`}>{STATUS_LABEL[c.status] || c.status}</span>
                        {c.endedBecause && <div className="cell-sub">{c.endedBecause}</div>}
                        {c.status === 'no video' && <div className="cell-sub">upload the advert to run</div>}
                      </td>
                      <td>
                        <div className="actions camp-row-actions">
                          {campaignActions(c).map(([action, icon, label]) => (
                            <button key={action} type="button" className={`btn btn-sm ${action === 'publish' || action === 'resume' ? 'btn-gold' : 'btn-ghost'}`} onClick={() => changeState(c, action)}>
                              {label}
                            </button>
                          ))}
                          <IconButton icon="pencil" title="Edit campaign" onClick={() => setEditingId(editingId === c.id ? null : c.id)} />
                          <IconButton icon={videoReportId === c.id ? 'eye-off' : 'bar-chart-3'} title="Performance by video" onClick={() => toggleVideoReport(c)} />
                          {isAdmin && <IconButton icon="trash-2" tone="danger" title={`Delete ${c.name}`} onClick={() => remove(c)} />}
                        </div>
                      </td>
                    </tr>

                    {editingId === c.id && (
                      <tr className="camp-edit-row">
                        <td colSpan={10}>
                          <CampaignForm editing initial={formFromCampaign(c)} categories={categories} busy={busy} onSubmit={(body) => saveEdit(c, body)} onCancel={() => setEditingId(null)} />
                        </td>
                      </tr>
                    )}

                    {videoReportId === c.id && (
                      <tr>
                        <td colSpan={10}>
                          {videoReportLoading && <p className="field-note">Loading…</p>}
                          {!videoReportLoading && videoReport && videoReport.length === 0 && <p className="field-note">No impressions recorded for this campaign yet.</p>}
                          {!videoReportLoading && videoReport && videoReport.length > 0 && (
                            <TableWrap>
                              <thead>
                                <tr>
                                  <th>Video</th>
                                  <th>Impressions</th>
                                  <th>Completed</th>
                                  <th>Clicks / CTR</th>
                                  <th>Revenue</th>
                                  <th>Last served</th>
                                </tr>
                              </thead>
                              <tbody>
                                {videoReport.map((v) => (
                                  <tr key={v.videoId}>
                                    <td>{v.title}</td>
                                    <td>{compact(v.impressions)}</td>
                                    <td>{compact(v.completed)}</td>
                                    <td>
                                      {compact(v.clicks)}
                                      {v.ctrPercent != null && <div className="cell-sub">{v.ctrPercent}% CTR</div>}
                                    </td>
                                    <td className="money">{tzs(v.revenueTzs)}</td>
                                    <td style={{ fontSize: 12 }}>{v.lastServedAt ? timeAgo(v.lastServedAt) : '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </TableWrap>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </TableWrap>
        </Async>
      </Panel>

      <AdPreview campaign={previewing} open={Boolean(previewing)} onClose={() => setPreviewing(null)} />
    </div>
  )
}

