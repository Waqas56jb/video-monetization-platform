import { useState } from 'react'
import { Megaphone, Plus } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import { StatGrid } from '@/components/ui/StatCard'
import { TableWrap, EmptyRow } from '@/components/ui/Table'
import { Async } from '@/components/ui/States'
import useApi, { tzs, compact } from '@/hooks/useApi'
import api from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'

/**
 * Advertising on free-with-ads videos.
 *
 * The figures are impressions actually served over the last thirty days, not a
 * projection. A campaign with no impressions shows zero, which is the useful
 * thing to know about it.
 */
export default function AdsTab() {
  const showToast = useToast()
  const { isAdmin } = useAuth()

  const { data, loading, error, reload } = useApi(() => api.admin.ads(), [])
  const settings = useApi(() => api.admin.settings(), [])

  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', advertiser: '', cpmTzs: 1000 })
  const [busy, setBusy] = useState(false)

  const campaigns = data?.campaigns || []
  const s = data?.stats
  const stats = [
    { icon: 'eye', label: 'Impressions (30d)', value: compact(s?.impressions) },
    { icon: 'coins', tone: 'gold', label: 'Ad Revenue (30d)', value: tzs(s?.revenue_tzs) },
    { icon: 'clapperboard', label: 'Videos Showing Ads', value: compact(s?.videos_with_ads) },
    { icon: 'megaphone', label: 'Campaigns', value: compact(campaigns.length) },
  ]

  const create = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.admin.createCampaign({
        name: form.name.trim(),
        advertiser: form.advertiser.trim() || undefined,
        cpmTzs: Number(form.cpmTzs) || 0,
      })
      showToast(`Campaign "${form.name}" created`)
      setForm({ name: '', advertiser: '', cpmTzs: 1000 })
      setCreating(false)
      reload({ quiet: true })
    } catch (err) {
      showToast(err.message)
    } finally {
      setBusy(false)
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
    ['preroll_enabled', 'Pre-roll ads', 'Shown before a free-with-ads video starts'],
    ['ads_on_expired_premieres', 'Ads once a premiere ends', 'When the paid window on a video closes'],
    ['share_ad_revenue', 'Share ad revenue with creators', 'Uses the same split as sales'],
  ]

  return (
    <div className="tab">
      <StatGrid stats={stats} />

      <div className="two-col">
        <Panel title="Pre-Roll Ad Settings">
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
                    <small>How long a viewer must watch before the skip button appears</small>
                  </div>
                  <b style={{ color: 'var(--gold)' }}>{ps.preroll_skip_after_secs}s</b>
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
            <form onSubmit={create} style={{ marginBottom: 18 }}>
              <div className="invite-grid">
                <div className="field">
                  <label htmlFor="camp-name">Campaign name</label>
                  <div className="input-wrap">
                    <input
                      id="camp-name"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="Vodacom Tanzania — June"
                      required
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
                      onChange={(e) => setForm((f) => ({ ...f, cpmTzs: e.target.value }))}
                    />
                  </div>
                </div>
                <button className="btn btn-gold" type="submit" disabled={busy}>
                  {busy ? 'Creating…' : 'Create'}
                </button>
              </div>
              <p className="field-note">
                CPM is what the advertiser pays per thousand impressions served.
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
              hint: 'Create one above and it starts serving on free-with-ads videos.',
            }}
          >
            <TableWrap minWidth={0}>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>CPM</th>
                  <th>Impressions</th>
                  <th>Revenue</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.length === 0 && <EmptyRow colSpan={5}>No campaigns yet.</EmptyRow>}
                {campaigns.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <b>{c.name}</b>
                      {c.advertiser && (
                        <small style={{ display: 'block', color: 'var(--muted2)', fontSize: 11 }}>
                          {c.advertiser}
                        </small>
                      )}
                    </td>
                    <td>{tzs(c.cpm_tzs)}</td>
                    <td>{compact(c.impressions)}</td>
                    <td className="money">{tzs(c.revenue_tzs)}</td>
                    <td>
                      <button
                        className={`pill ${c.active ? 'ok' : ''}`}
                        style={{ cursor: 'pointer', border: 0 }}
                        onClick={() => toggle(c)}
                        title={c.active ? 'Pause this campaign' : 'Start this campaign'}
                      >
                        {c.active ? 'Running' : 'Paused'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </Async>
        </Panel>
      </div>
    </div>
  )
}
