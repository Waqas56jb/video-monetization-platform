import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Activity, Banknote, X } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import { StatGrid } from '@/components/ui/StatCard'
import { TableWrap, UserCell, EmptyRow } from '@/components/ui/Table'
import Icon from '@/components/ui/Icon'
import { Async, EmptyState } from '@/components/ui/States'
import RevenueAreaChart from '@/components/charts/RevenueAreaChart'
import DonutChart from '@/components/charts/DonutChart'
import useApi, { tzs, compact, shortDate, timeAgo } from '@/hooks/useApi'
import api from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { useConfirm } from '@/context/ConfirmContext'
import { useToast } from '@/context/ToastContext'

/**
 * The dashboard, on real figures.
 *
 * Every number here is counted from the database. On a platform with no
 * activity yet that means four zeroes and an empty queue — which is the honest
 * answer, and far more useful than the invented millions that used to sit here.
 */
export default function OverviewTab() {
  const showToast = useToast()
  const confirm = useConfirm()
  const { can } = useAuth()

  /**
   * The dashboard shows what this person is allowed to see.
   *
   * These panels read from modules that are permission-gated on the server. A
   * moderator with no `withdrawals` grant asking for the payout queue gets a
   * 403 — correct, and it would render here as a broken panel on the landing
   * screen. Not asking is the honest version: the panel is simply not part of
   * their dashboard.
   */
  const seeRevenue = can('revenue')
  const seeWithdrawals = can('withdrawals')

  const overview = useApi(() => api.admin.overview(), [])
  const withdrawals = useApi(() => api.admin.withdrawals(), [], { skip: !seeWithdrawals })
  const revenue = useApi(() => api.admin.revenue(), [], { skip: !seeRevenue })
  const activity = useApi(() => api.admin.activity(), [])

  const o = overview.data
  const stats = [
    { icon: 'users', label: 'Total Users', value: compact(o?.users?.total) },
    { icon: 'video', label: 'Creators', value: compact(o?.users?.creators) },
    { icon: 'clapperboard', label: 'Videos', value: compact(o?.videos?.total) },
    { icon: 'coins', tone: 'gold', label: 'Total Revenue', value: tzs(o?.revenue?.grossTzs) },
  ]

  const pending = (withdrawals.data?.withdrawals || []).filter((w) => w.status === 'pending')

  const decide = useCallback(
    async (w, decision) => {
      try {
        await api.admin.decideWithdrawal(w.id, { decision })
        showToast(
          decision === 'paid'
            ? `Withdrawal of ${tzs(w.amount_tzs)} marked paid`
            : 'Withdrawal rejected'
        )
        withdrawals.reload({ quiet: true })
        overview.reload({ quiet: true })
      } catch (err) {
        showToast(err.message)
      }
    },
    [showToast, withdrawals, overview]
  )

  const reject = (w) =>
    confirm({
      title: 'Reject this withdrawal?',
      text: `${tzs(w.amount_tzs)} will stay in ${w.creator_name || 'the creator'}'s balance and they will be told it was declined.`,
      onConfirm: () => decide(w, 'rejected'),
    })

  return (
    <div className="tab">
      <StatGrid stats={stats} />

      {seeRevenue && (
      <div className="two-col">
        <Panel title="Revenue Overview" action={<span className="link">Last 30 days</span>}>
          <Async loading={revenue.loading} error={revenue.error} onRetry={revenue.reload} rows={4}>
            {revenue.data?.monthly?.length > 1 ? (
              <RevenueAreaChart series={revenue.data.monthly} />
            ) : (
              /* A trend line needs two points, but saying "no revenue yet" while
                 the stat card above reads TZS 15,500 makes both figures look
                 unreliable. Say which of the two is actually missing. */
              <EmptyState
                icon={Banknote}
                title={
                  revenue.data?.totals?.gross
                    ? `${tzs(revenue.data.totals.gross)} so far, all in one month`
                    : 'No revenue yet'
                }
                hint={
                  revenue.data?.totals?.gross
                    ? 'A trend line needs a second month to compare against. It appears here as soon as sales carry over into next month.'
                    : 'This chart fills in as soon as the first sale goes through.'
                }
              />
            )}
          </Async>
        </Panel>

        <Panel title="Revenue Breakdown">
          <Async loading={revenue.loading} error={revenue.error} onRetry={revenue.reload} rows={4}>
            {revenue.data?.totals?.gross ? (
              <DonutChart
                creatorTzs={revenue.data.totals.creators}
                platformTzs={revenue.data.totals.platform}
              />
            ) : (
              <EmptyState
                icon={Banknote}
                title="Nothing to split yet"
                hint="Creator and platform shares appear once money has moved."
              />
            )}
          </Async>
        </Panel>
      </div>
      )}

      <div className="two-col">
        {seeWithdrawals && (
        <Panel
          title="Pending Withdrawals"
          action={
            <Link className="link" to="/withdrawals">
              View All
            </Link>
          }
        >
          <Async
            loading={withdrawals.loading}
            error={withdrawals.error}
            onRetry={withdrawals.reload}
            rows={3}
          >
            <TableWrap>
              <thead>
                <tr>
                  <th>Creator</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Requested</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pending.length === 0 && (
                  <EmptyRow colSpan={5}>No pending withdrawals — the queue is clear.</EmptyRow>
                )}
                {pending.slice(0, 5).map((w) => (
                  <tr key={w.id}>
                    <td>
                      <UserCell
                        avatar={w.creator_avatar}
                        name={w.creator_name || w.creator_email}
                        sub={w.creator_email}
                      />
                    </td>
                    <td className="money">{tzs(w.amount_tzs)}</td>
                    <td>{w.method === 'airtel' ? 'Airtel Money' : 'M-Pesa'}</td>
                    <td>{shortDate(w.requested_at || w.created_at)}</td>
                    <td>
                      <div className="actions">
                        <button className="btn btn-green btn-sm" onClick={() => decide(w, 'paid')}>
                          Mark paid
                        </button>
                        <button
                          className="ibtn danger"
                          title="Reject withdrawal"
                          aria-label="Reject withdrawal"
                          onClick={() => reject(w)}
                        >
                          <X />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </Async>
        </Panel>
        )}

        <Panel
          title="Recent Activity"
          action={
            <span className="badge">
              <span className="dot" />
              LIVE
            </span>
          }
        >
          <Async
            loading={activity.loading}
            error={activity.error}
            onRetry={activity.reload}
            empty={!activity.data?.activity?.length}
            rows={5}
            emptyProps={{
              icon: Activity,
              title: 'Nothing has happened yet',
              hint: 'Approvals, sales and payouts appear here as they occur.',
            }}
          >
            <div className="feed">
              {(activity.data?.activity || []).slice(0, 12).map((a) => (
                <div className="feed-item" key={a.id}>
                  <span className={`feed-ic ${toneFor(a.action)}`}>
                    <Icon name={iconFor(a.action)} />
                  </span>
                  <div>
                    <p>
                      <b>{a.actor_name || 'System'}</b> {humanise(a.action)}
                      {a.entity_type ? ` a ${a.entity_type}` : ''}
                    </p>
                    <small>{timeAgo(a.created_at)}</small>
                  </div>
                </div>
              ))}
            </div>
          </Async>
        </Panel>
      </div>
    </div>
  )
}

/* The audit log stores machine-shaped verbs; these read them out loud. */
const humanise = (action = '') => action.toLowerCase().replace(/_/g, ' ')

const iconFor = (action = '') => {
  if (/APPROVE|PUBLISH|VERIFIED/.test(action)) return 'check-circle-2'
  if (/REJECT|REMOVE|BLOCK|DELET/.test(action)) return 'ban'
  if (/WITHDRAWAL/.test(action)) return 'banknote'
  if (/SETTINGS|SPLIT/.test(action)) return 'settings'
  if (/ANNOUNCE/.test(action)) return 'megaphone'
  if (/SUB_ADMIN/.test(action)) return 'user-plus'
  return 'scroll-text'
}

const toneFor = (action = '') => {
  if (/APPROVE|PUBLISH|VERIFIED/.test(action)) return 'good'
  if (/REJECT|REMOVE|BLOCK|DELET/.test(action)) return 'danger'
  return ''
}
