import { useEffect, useState } from 'react'
import { Percent, Save } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import { StatGrid } from '@/components/ui/StatCard'
import { IconButton, TableWrap, UserCell } from '@/components/ui/Table'
import { Async, EmptyState } from '@/components/ui/States'
import RevenueAreaChart from '@/components/charts/RevenueAreaChart'
import useApi, { tzs } from '@/hooks/useApi'
import api from '@/lib/api'
import { useToast } from '@/context/ToastContext'

/**
 * What the platform keeps, and what creators earn.
 *
 * The global split applies to *new* sales only. Money already split stays split
 * the way it was — changing the rule cannot reach backwards and quietly restate
 * what a creator was told they had earned.
 */
export default function RevenueTab() {
  const showToast = useToast()
  const { data, loading, error, reload } = useApi(() => api.admin.revenue(), [])

  const [share, setShare] = useState(70)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (data?.defaultSplitPercent != null) setShare(Number(data.defaultSplitPercent))
  }, [data?.defaultSplitPercent])

  const totals = data?.totals
  const stats = [
    { icon: 'coins', tone: 'gold', label: 'Gross Revenue', value: tzs(totals?.gross) },
    { icon: 'users', label: 'Paid to Creators', value: tzs(totals?.creators) },
    { icon: 'landmark', label: 'Platform Share', value: tzs(totals?.platform) },
    { icon: 'megaphone', label: 'From Advertising', value: tzs(totals?.from_ads) },
  ]

  const saveSplit = async () => {
    setSaving(true)
    try {
      await api.admin.updateSettings({ creator_split_percent: share })
      showToast(`New sales now split ${share}/${100 - share}`)
      reload({ quiet: true })
    } catch (err) {
      showToast(err.message)
    } finally {
      setSaving(false)
    }
  }

  const editOverride = (o) => {
    const current = o.revenue_split_percent ?? data?.defaultSplitPercent ?? 70
    const answer = window.prompt(
      `What share should ${o.name} keep, as a percentage?\n\n` +
        `The platform default is ${data?.defaultSplitPercent ?? 70}%. Leave blank to put them back on it.`,
      String(current)
    )
    if (answer === null) return

    const trimmed = answer.trim()
    const value = trimmed === '' ? null : Number(trimmed)
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > 100)) {
      return showToast('Enter a number between 0 and 100, or leave it blank')
    }

    api.admin
      .setCreatorSplit(o.id, value)
      .then(() => {
        showToast(value === null ? 'Back on the platform default' : `${o.name} now keeps ${value}%`)
        reload({ quiet: true })
      })
      .catch((err) => showToast(err.message))
  }

  return (
    <div className="tab">
      <div className="two-col">
        <Panel
          title="Global Revenue Split"
          action={<span className="pill ok">Applies to new sales only</span>}
        >
          <div className="split-config">
            <div className="split-vis">
              <span style={{ width: `${share}%` }} />
              <span />
            </div>

            <div className="range-row">
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>Creator share</span>
              <input
                type="range"
                min="50"
                max="90"
                value={share}
                aria-label="Creator share percentage"
                onChange={(e) => setShare(Number(e.target.value))}
              />
              <span className="range-val">
                {share}% / {100 - share}%
              </span>
            </div>

            <div className="legend" style={{ justifyContent: 'flex-start' }}>
              <span>
                <i style={{ background: 'linear-gradient(135deg,#7c3aed,#a78bfa)' }} />
                Creator share
              </span>
              <span>
                <i style={{ background: 'var(--gold)' }} />
                Platform share
              </span>
            </div>

            <p className="field-note">
              Earnings already recorded keep the split they were paid at. Changing this cannot
              restate what a creator has already been told they earned.
            </p>

            <button
              className="btn btn-gold"
              style={{ width: 'fit-content' }}
              onClick={saveSplit}
              disabled={saving || loading}
            >
              <Save />
              {saving ? 'Saving…' : 'Save Global Split'}
            </button>
          </div>
        </Panel>

        <Panel title="Per-Creator Overrides">
          <Async loading={loading} error={error} onRetry={reload} rows={4}>
            {data?.overrides?.length ? (
              <TableWrap minWidth={0}>
                <thead>
                  <tr>
                    <th>Creator</th>
                    <th>Split</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.overrides.map((o) => (
                    <tr key={o.id}>
                      <td>
                        {/* Display names are not unique. Without the email, two
                            different people with the same name look like the
                            same row listed twice. */}
                        <UserCell name={o.name} sub={o.email} />
                      </td>
                      <td>
                        {o.revenue_split_percent != null ? (
                          <b style={{ color: 'var(--purple2)' }}>{o.revenue_split_percent}%</b>
                        ) : (
                          <span style={{ color: 'var(--muted)' }}>
                            {data.defaultSplitPercent}% (default)
                          </span>
                        )}
                      </td>
                      <td>
                        <IconButton
                          icon="pencil"
                          title={`Change the split for ${o.name}`}
                          onClick={() => editOverride(o)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            ) : (
              <EmptyState
                icon={Percent}
                title="No creators yet"
                hint="Once creators sign up you can put any of them on their own split."
              />
            )}
          </Async>
        </Panel>
      </div>

      <Panel title="Platform Earnings Summary">
        <StatGrid stats={stats} style={{ margin: 0 }} />
      </Panel>

      <Panel title="Revenue Over Time">
        <Async loading={loading} error={error} onRetry={reload} rows={4}>
          {data?.monthly?.length > 1 ? (
            <RevenueAreaChart series={data.monthly} label="Gross revenue by month" />
          ) : (
            <EmptyState
              icon={Percent}
              title={
                totals?.gross
                  ? `${tzs(totals.gross)} so far, all in one month`
                  : 'No sales yet'
              }
              hint={
                totals?.gross
                  ? 'A trend line needs a second month to compare against. It appears here as soon as sales carry over into next month.'
                  : 'This chart fills in once the first sale goes through.'
              }
            />
          )}
        </Async>
      </Panel>
    </div>
  )
}
