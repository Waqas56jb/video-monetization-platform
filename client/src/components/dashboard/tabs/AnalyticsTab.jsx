import { useNavigate } from 'react-router-dom'
import { BarChart3, Compass, Eye, Film } from 'lucide-react'
import Panel from '../Panel'
import StatCard from '../StatCard'
import RevenueChart from '../RevenueChart'
import TableScroll from '@/components/ui/TableScroll'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import useApi, { tzs, compact, duration, shortDate, ACCESS_SHORT } from '@/hooks/useApi'
import api from '@/lib/api'
import { useAuth } from '@/context/AuthContext'

/**
 * How you have been getting on.
 *
 * Used to be one page for both questions — a dual-role account got its own
 * purchase history bundled into Creator Analytics too, on the reasoning that
 * it is one person either way. The client's Sep 14 review asked for strict
 * separation instead: this side shows creator performance only, full stop —
 * conversion rate, top videos, earnings — and nothing about what the same
 * person has bought. That half now lives only under Viewer → My Activity,
 * even for a dual-role account looking at this tab from its Create side.
 *
 * `isCreator` is derived from `data.role`, and the server (account.routes.js
 * /analytics) already folds BOTH capability and the requested side into that
 * one field — so gating on it here is gating on the side actually open, not
 * merely on whether the account is creator-capable at all.
 *
 * Every number is counted. On a new account that means zeroes, which is the
 * truth and the only thing worth acting on.
 */
export default function AnalyticsTab() {
  const navigate = useNavigate()
  const { accountSide } = useAuth()
  /**
   * This tab is reachable from either side of a dual-role account (it's one
   * of the shared tabs `Dashboard.jsx`'s `TABS_BY_ROLE` offers both). Without
   * `side`, the server had no way to tell "capable of creator analytics"
   * apart from "currently looking at the Watch dashboard", so it always
   * returned the former — full creator figures leaking into a viewer-side
   * visit. Re-fetches when the side is switched, not just on mount.
   */
  const { data, loading, error, reload } = useApi(() => api.account.analytics(accountSide), [accountSide])

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
      {/**
       * Used to render unconditionally, every time, for every account —
       * "one page, two questions" was the deliberate original design. The
       * client's Sep 14 review asked for the opposite: Creator Analytics is
       * creator performance only, full stop, and viewer figures belong on
       * Viewer → My Activity even for a dual-role account looking at this
       * tab from its Create side. `data.role` is what the server now
       * actually answers with — 'viewer' only when the viewer half was
       * computed at all (account.routes.js /analytics) — so this gates on
       * that rather than repeating the isCreator check above, which is
       * capability, not "which half did the server send".
       */}
      {!isCreator && (
        <>
          <div className="stat-grid">
            <StatCard stat={{ icon: 'library', label: 'In your library', value: String(v.videosOwned) }} />
            <StatCard stat={{ icon: 'coins', tone: 'gold', label: 'Total spent', value: tzs(v.spentTzs) }} />
            <StatCard
              stat={{
                icon: 'timer',
                label: 'Watch time in your library',
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
        </>
      )}
    </div>
  )
}
