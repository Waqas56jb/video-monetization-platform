import { useMemo } from 'react'
import { BarChart3, Clapperboard } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import { StatGrid } from '@/components/ui/StatCard'
import { TableWrap, VideoCell, EmptyRow } from '@/components/ui/Table'
import { Async, EmptyState } from '@/components/ui/States'
import PaymentsBarChart from '@/components/charts/PaymentsBarChart'
import MeterList from '@/components/charts/MeterList'
import useApi, { tzs, compact } from '@/hooks/useApi'
import api, { mediaUrl } from '@/lib/api'

const ACCESS_LABEL = {
  ppv_forever: 'Pay Once',
  paid_premiere: 'Premiere',
  free_with_ads: 'Free + ads',
}

/**
 * Performance across the platform — counted, not projected.
 *
 * Everything on this page is derived from rows that exist. On a quiet platform
 * that means zeroes and empty charts, which is the truthful picture and the one
 * worth acting on.
 */
export default function AnalyticsTab() {
  /**
   * Analytics reads from two permission-gated modules. Somebody without them
   * gets a 403 rather than a chart, so the request is not made — the section
   * is simply not part of their view.
   */
  const { can } = useAuth()
  const seePayments = can('payments')
  const seeVideos = can('videos')

  const overview = useApi(() => api.admin.overview(), [])
  const payments = useApi(() => api.admin.payments({ limit: 200 }), [], { skip: !seePayments })
  const videos = useApi(() => api.admin.videos({ status: 'published', limit: 100 }), [], {
    skip: !seeVideos,
  })

  const rows = payments.data?.payments || []
  const succeeded = rows.filter((p) => p.status === 'success')

  const o = overview.data
  const stats = [
    { icon: 'eye', label: 'Total Views', value: compact((videos.data?.videos || []).reduce((n, v) => n + (v.views || 0), 0)) },
    { icon: 'ticket', label: 'Paid Unlocks', value: compact((videos.data?.videos || []).reduce((n, v) => n + (v.paidUnlocks || 0), 0)) },
    {
      icon: 'percent',
      label: 'Payment Success',
      value: rows.length ? Math.round((succeeded.length / rows.length) * 100) + '%' : '—',
    },
    { icon: 'coins', tone: 'gold', label: 'Gross Revenue', value: tzs(o?.revenue?.grossTzs) },
  ]

  /** How people actually paid, by share of successful transactions. */
  const methods = useMemo(() => {
    if (!succeeded.length) return []
    const counts = {}
    for (const p of succeeded) counts[p.method] = (counts[p.method] || 0) + 1
    const labels = { mpesa: 'M-Pesa', airtel: 'Airtel Money', card: 'Card' }
    const fills = { mpesa: 'linear-gradient(135deg,#7c3aed,#a78bfa)', airtel: 'var(--gold)', card: '#34d399' }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([method, n]) => ({
        label: labels[method] || method,
        value: `${Math.round((n / succeeded.length) * 100)}%`,
        width: `${(n / succeeded.length) * 100}%`,
        fill: fills[method] || 'var(--purple2)',
      }))
  }, [succeeded])

  const top = useMemo(
    () => [...(videos.data?.videos || [])].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 10),
    [videos.data]
  )

  return (
    <div className="tab">
      <StatGrid stats={stats} />

      <div className="two-col">
        <Panel title="Payments per Day" action={<span className="link">Last 14 days</span>}>
          <Async loading={payments.loading} error={payments.error} onRetry={payments.reload} rows={4}>
            <PaymentsBarChart payments={rows} />
          </Async>
        </Panel>

        <Panel title="Payment Methods">
          <Async loading={payments.loading} error={payments.error} onRetry={payments.reload} rows={3}>
            {methods.length ? (
              <MeterList meters={methods} />
            ) : (
              <EmptyState
                icon={BarChart3}
                title="No successful payments yet"
                hint="The split between M-Pesa, Airtel Money and card appears once money starts moving."
              />
            )}
          </Async>
        </Panel>
      </div>

      <Panel title="Most Watched">
        <Async
          loading={videos.loading}
          error={videos.error}
          onRetry={videos.reload}
          empty={!top.length}
          rows={5}
          emptyProps={{
            icon: Clapperboard,
            title: 'Nothing published yet',
            hint: 'Approved videos appear here, ranked by how much they are actually watched.',
          }}
        >
          <TableWrap>
            <thead>
              <tr>
                <th>#</th>
                <th>Video</th>
                <th>Creator</th>
                <th>Access</th>
                <th>Views</th>
                <th>Paid Unlocks</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              {top.length === 0 && <EmptyRow colSpan={7}>Nothing published yet.</EmptyRow>}
              {top.map((v, i) => (
                <tr key={v.id}>
                  <td>{i + 1}</td>
                  <td>
                    <VideoCell thumb={mediaUrl(v.thumbnailUrl)} title={v.title} />
                  </td>
                  <td>{v.creatorName || v.creator?.name || '—'}</td>
                  <td>
                    <span className="pill free">{ACCESS_LABEL[v.accessType] || v.accessType}</span>
                  </td>
                  <td>{compact(v.views)}</td>
                  <td>{compact(v.paidUnlocks)}</td>
                  <td className="money">
                    {v.accessType === 'free_with_ads' ? 'Free' : tzs(v.priceTzs)}
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
