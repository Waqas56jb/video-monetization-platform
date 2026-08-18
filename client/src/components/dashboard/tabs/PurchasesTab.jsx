import { useNavigate } from 'react-router-dom'
import { Compass, Receipt } from 'lucide-react'
import Panel from '../Panel'
import StatCard from '../StatCard'
import TableScroll from '@/components/ui/TableScroll'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import useApi, { tzs, shortDate } from '@/hooks/useApi'
import api from '@/lib/api'

const PILL = { active: 'ok', refunded: 'bad', revoked: 'bad' }
const METHOD = { mpesa: 'M-Pesa', airtel: 'Airtel Money', card: 'Card' }

/** The viewer's own receipts — what they bought, how they paid, and its state. */
export default function PurchasesTab() {
  const navigate = useNavigate()
  const { data, loading, error, reload } = useApi(() => api.library.purchases(), [])

  const rows = data?.purchases || []
  const stats = [
    { icon: 'library', label: 'In your library', value: String(data?.stats?.videosOwned ?? 0) },
    { icon: 'coins', tone: 'gold', label: 'Total spent', value: tzs(data?.stats?.totalSpentTzs) },
  ]

  return (
    <div>
      {loading ? (
        <Skeleton rows={2} />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <div className="stat-grid">
          {stats.map((s) => (
            <StatCard key={s.label} stat={s} />
          ))}
        </div>
      )}

      <Panel title="Purchase history" action={<span className="link">All amounts in TZS</span>}>
        {loading ? (
          <Skeleton rows={4} />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !rows.length ? (
          <EmptyState
            icon={Receipt}
            title="You haven't bought anything yet"
            message="Every purchase is receipted here, and what you buy stays in your library."
            action={
              <button className="btn btn-gold" onClick={() => navigate('/explore')}>
                <Compass />
                Browse videos
              </button>
            }
          />
        ) : (
          <TableScroll>
            <thead>
              <tr>
                <th>Date</th>
                <th>Video</th>
                <th>Creator</th>
                <th>Method</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>{shortDate(p.purchasedAt)}</td>
                  <td>
                    <button
                      className="link-cell"
                      onClick={() => navigate(`/watch/${p.videoSlug || p.videoId}`)}
                    >
                      {p.videoTitle}
                      {p.isPublished === false && (
                        <div className="cell-sub">No longer listed — still in your library</div>
                      )}
                    </button>
                  </td>
                  <td>{p.creatorName || '—'}</td>
                  <td>{METHOD[p.method] || p.method || '—'}</td>
                  <td style={{ color: 'var(--gold)', fontWeight: 700 }}>{tzs(p.amountTzs)}</td>
                  <td>
                    <span className={`pill ${PILL[p.status] ?? ''}`}>
                      {p.status === 'active' ? 'In library' : p.status}
                    </span>
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
