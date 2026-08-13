import { useNavigate } from 'react-router-dom'
import { BarChart3, Compass, Eye, Film } from 'lucide-react'
import Panel from '../Panel'
import StatCard from '../StatCard'
import RevenueChart from '../RevenueChart'
import TableScroll from '@/components/ui/TableScroll'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import useApi, { tzs, compact, duration, shortDate, ACCESS_SHORT } from '@/hooks/useApi'
import api from '@/lib/api'

/**
 * How you have been getting on.
 *
 * Two questions, one page, because it is one person: a creator wants to know
 * what is selling, and everybody wants to know what they have spent and what
 * they own. A viewer sees only the second half — there is no point showing
 * somebody a conversion rate on videos they have not made.
 *
 * Every number is counted. On a new account that means zeroes, which is the
 * truth and the only thing worth acting on.
 */
export default function AnalyticsTab() {
  const navigate = useNavigate()
  const { data, loading, error, reload } = useApi(() => api.account.analytics(), [])

  if (loading) return <Skeleton rows={5} />
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!data) return <ErrorState error={{ message: 'Analytics could not be loaded.' }} onRetry={reload} />

  const isCreator = data.role === 'creator' || data.role === 'admin' || data.role === 'sub_admin'
  const c = data.creator || {
    views: 0,
    paidUnlocks: 0,
    conversionPercent: null,
    published: 0,
    daily: [],
    topVideos: [],
    byAccessType: [],
  }
  const v = data.viewer || { videosOwned: 0, spentTzs: 0, ownedSeconds: 0, purchases: 0, recent: [] }

  return (
    <div>
      {isCreator && (
        <>
          <div className="stat-grid">
            <StatCard stat={{ icon: 'eye', label: 'Total views', value: compact(c.views) }} />
            <StatCard stat={{ icon: 'ticket', label: 'Paid unlocks', value: compact(c.paidUnlocks) }} />
            <StatCard
              stat={{
                icon: 'percent',
                tone: 'gold',
                label: 'Viewers who paid',
                value: c.conversionPercent === null ? '—' : `${c.conversionPercent}%`,
              }}
            />
            <StatCard stat={{ icon: 'clapperboard', label: 'Published videos', value: String(c.published) }} />
          </div>

          {c.views > 0 && (
            <p className="analytics-note">
              {c.paidUnlocks === 0
                ? `${compact(c.views)} people have watched and none have paid yet. A shorter free preview, or a lower price, is usually what moves that first.`
                : `${c.conversionPercent}% of the people who watched went on to pay. That is the number to move.`}
            </p>
          )}

          <Panel title="Earnings over the last 30 days">
            {c.daily?.length > 1 ? (
              <RevenueChart series={c.daily} />
            ) : (
              <EmptyState
                icon={BarChart3}
                title="Not enough activity to plot yet"
                message="This chart fills in as sales come through — it needs more than one day of them."
              />
            )}
          </Panel>

          <Panel title="Your videos, best earning first">
            {!c.topVideos?.length ? (
              <EmptyState
                icon={Film}
                title="Nothing uploaded yet"
                message="Upload something and this shows you exactly what it is doing."
              />
            ) : (
              <TableScroll>
                <thead>
                  <tr>
                    <th>Video</th>
                    <th>Type</th>
                    <th>Views</th>
                    <th>Sales</th>
                    <th>Conversion</th>
                    <th>Earned</th>
                  </tr>
                </thead>
                <tbody>
                  {c.topVideos.map((row) => {
                    const rate = row.views > 0 ? (row.paidUnlocks / row.views) * 100 : null
                    return (
                      <tr key={row.id}>
                        <td>
                          <button className="link-cell" onClick={() => navigate(`/watch/${row.slug || row.id}`)}>
                            {row.title}
                          </button>
                        </td>
                        <td>{ACCESS_SHORT[row.accessType] || row.accessType}</td>
                        <td>{compact(row.views)}</td>
                        <td>{compact(row.paidUnlocks)}</td>
                        <td>{rate === null ? '—' : `${Math.round(rate * 10) / 10}%`}</td>
                        <td style={{ color: 'var(--green)', fontWeight: 700 }}>{tzs(row.earnedTzs)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </TableScroll>
            )}
          </Panel>

          {c.byAccessType?.length > 1 && (
            <Panel title="How your videos are sold">
              <div className="access-split">
                {c.byAccessType.map((a) => (
                  <div className="access-split-row" key={a.accessType}>
                    <span>{ACCESS_SHORT[a.accessType] || a.accessType}</span>
                    <div className="split-vis">
                      <span
                        style={{
                          width: `${(a.views / Math.max(1, c.views)) * 100}%`,
                          background: 'linear-gradient(135deg,#7c3aed,#a78bfa)',
                        }}
                      />
                      <span style={{ background: 'var(--card2)' }} />
                    </div>
                    <b>
                      {a.videos} video{a.videos === 1 ? '' : 's'} · {compact(a.views)} views
                    </b>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </>
      )}

      {/* ------------------------ what I have watched ------------------------ */}
      <div className="stat-grid">
        <StatCard stat={{ icon: 'library', label: 'Videos you own', value: String(v.videosOwned) }} />
        <StatCard stat={{ icon: 'coins', tone: 'gold', label: 'Total spent', value: tzs(v.spentTzs) }} />
        <StatCard
          stat={{
            icon: 'timer',
            label: 'Watch time you own',
            value: v.ownedSeconds ? duration(v.ownedSeconds) : '0:00',
          }}
        />
        <StatCard stat={{ icon: 'receipt', label: 'Purchases', value: String(v.purchases) }} />
      </div>

      <Panel title="What you have bought">
        {!v.recent?.length ? (
          <EmptyState
            icon={Eye}
            title="You haven't bought anything yet"
            message="Anything you buy stays in your library, and it will be listed here."
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
                <th>Paid</th>
              </tr>
            </thead>
            <tbody>
              {v.recent.map((r) => (
                <tr key={r.videoId + r.purchasedAt}>
                  <td>{shortDate(r.purchasedAt)}</td>
                  <td>
                    <button className="link-cell" onClick={() => navigate(`/watch/${r.slug || r.videoId}`)}>
                      {r.title}
                    </button>
                  </td>
                  <td style={{ color: 'var(--gold)', fontWeight: 700 }}>{tzs(r.amountTzs)}</td>
                </tr>
              ))}
            </tbody>
          </TableScroll>
        )}
      </Panel>
    </div>
  )
}
