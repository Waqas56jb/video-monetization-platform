import { Coins, Receipt } from 'lucide-react'
import Panel from '../Panel'
import StatCard from '../StatCard'
import RevenueChart from '../RevenueChart'
import DonutChart from '../DonutChart'
import TableScroll from '@/components/ui/TableScroll'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import useApi, { tzs, compact, shortDate } from '@/hooks/useApi'
import api from '@/lib/api'

/**
 * The creator's own numbers, counted from what actually happened.
 *
 * A brand-new creator sees zeroes and an empty table, which is the truth and
 * far more useful than the invented millions that used to sit here — those made
 * it impossible to tell whether anything was working.
 */
export default function OverviewTab() {
  const earnings = useApi(() => api.earnings.summary(), [])
  const transactions = useApi(() => api.earnings.transactions(), [])

  const e = earnings.data
  const rows = transactions.data?.transactions || []

  const stats = [
    { icon: 'wallet', tone: 'gold', label: 'Available Balance', value: tzs(e?.balance?.availableTzs) },
    { icon: 'coins', label: 'Lifetime Earnings', value: tzs(e?.balance?.lifetimeTzs) },
    { icon: 'eye', label: 'Total Views', value: compact(e?.stats?.totalViews) },
    { icon: 'ticket', label: 'Sales', value: compact(e?.stats?.paidUnlocks) },
    { icon: 'clapperboard', label: 'Published', value: compact(e?.stats?.publishedVideos) },
  ]

  return (
    <div>
      {earnings.loading ? (
        <Skeleton rows={2} />
      ) : earnings.error ? (
        <ErrorState message={earnings.error} onRetry={earnings.reload} />
      ) : (
        <div className="stat-grid">
          {stats.map((s) => (
            <StatCard key={s.label} stat={s} />
          ))}
        </div>
      )}

      <div className="two-col">
        <Panel title="Revenue Overview" action={<span className="link">Last 30 days</span>}>
          {earnings.loading ? (
            <Skeleton rows={3} />
          ) : e?.daily?.some((d) => d.amountTzs > 0) ? (
            <RevenueChart series={e.daily} />
          ) : (
            <EmptyState
              icon={Coins}
              title="No earnings yet"
              message="This chart fills in as soon as somebody buys one of your videos, or an advert plays on a Free + Ads title."
            />
          )}
        </Panel>

        <Panel title="Earnings Breakdown">
          {earnings.loading ? (
            <Skeleton rows={3} />
          ) : e?.balance?.lifetimeTzs ? (
            <DonutChart
              creatorTzs={e.balance.lifetimeTzs}
              platformTzs={e.balance.platformShareTzs}
            />
          ) : (
            <EmptyState
              icon={Coins}
              title="Nothing to split yet"
              message="Your share and the platform's will show here once money has moved."
            />
          )}
        </Panel>
      </div>

      <Panel title="Recent Transactions">
        {transactions.loading ? (
          <Skeleton rows={4} />
        ) : transactions.error ? (
          <ErrorState message={transactions.error} onRetry={transactions.reload} />
        ) : !rows.length ? (
          <EmptyState
            icon={Receipt}
            title="No transactions yet"
            message="Every sale and every completed advert appears here the moment it clears, with your share of it."
          />
        ) : (
          <TableScroll>
            <thead>
              <tr>
                <th>Date</th>
                <th>Source</th>
                <th>Video</th>
                <th>Gross</th>
                <th>Your Share</th>
                <th>Split</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td>{shortDate(t.createdAt)}</td>
                  <td>{t.source === 'ad' ? 'Advertising' : 'Sale'}</td>
                  <td style={{ fontWeight: 700 }}>{t.videoTitle || '—'}</td>
                  <td>{tzs(t.grossTzs)}</td>
                  <td style={{ color: 'var(--green)', fontWeight: 700 }}>{tzs(t.creatorTzs)}</td>
                  <td>
                    <span className="pill ok">{t.splitPercent}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableScroll>
        )}
      </Panel>
    </div>
  )
}
