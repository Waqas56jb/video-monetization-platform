import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import { StatGrid } from '@/components/ui/StatCard'
import { TableWrap, UserCell, EmptyRow, rowClass } from '@/components/ui/Table'
import RevenueAreaChart from '@/components/charts/RevenueAreaChart'
import DonutChart from '@/components/charts/DonutChart'
import Icon from '@/components/ui/Icon'
import { useAdminData } from '@/context/AdminDataContext'
import { useConfirm } from '@/context/ConfirmContext'
import { useToast } from '@/context/ToastContext'
import { CONFIRM, OVERVIEW_STATS, TOASTS } from '@/data/adminData'

export default function OverviewTab() {
  const { overviewWithdrawals, feed } = useAdminData()
  const confirm = useConfirm()
  const showToast = useToast()

  const approve = (row) => {
    overviewWithdrawals.remove(row.id)
    showToast(row.approveMsg)
  }

  const reject = (row) =>
    confirm({
      ...CONFIRM.rejectWithdrawalShort,
      onConfirm: () => {
        overviewWithdrawals.remove(row.id)
        showToast(TOASTS.withdrawalRejected)
      },
    })

  return (
    <div className="tab">
      <StatGrid stats={OVERVIEW_STATS} />

      <div className="two-col">
        <Panel title="Revenue Overview" action={<span className="link">This Month ▾</span>}>
          <RevenueAreaChart />
        </Panel>

        <Panel title="Revenue Breakdown">
          <DonutChart />
        </Panel>
      </div>

      <div className="two-col">
        <Panel
          title="Pending Withdrawals"
          action={
            <Link className="link" to="/withdrawals">
              View All
            </Link>
          }
        >
          <TableWrap>
            <thead>
              <tr>
                <th>Creator</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {overviewWithdrawals.items.length === 0 && (
                <EmptyRow colSpan={5}>No pending withdrawals — the queue is clear.</EmptyRow>
              )}
              {overviewWithdrawals.items.map((row) => (
                <tr key={row.id} className={rowClass(row, false)}>
                  <td>
                    <UserCell avatar={row.avatar} name={row.name} sub={row.sub} />
                  </td>
                  <td className="money">{row.amount}</td>
                  <td>{row.method}</td>
                  <td>{row.date}</td>
                  <td>
                    <div className="actions">
                      <button className="btn btn-green btn-sm" onClick={() => approve(row)}>
                        Approve
                      </button>
                      <button
                        className="ibtn danger"
                        title="Reject withdrawal"
                        aria-label="Reject withdrawal"
                        onClick={() => reject(row)}
                      >
                        <X />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Panel>

        <Panel
          title="Live Activity"
          action={
            <span className="badge">
              <span className="dot" />
              LIVE
            </span>
          }
        >
          <div className="feed">
            {feed.map((item) => (
              <div
                className={`feed-item ${item.fresh ? 'feed-enter' : ''}`.trim()}
                key={item.id}
              >
                <span className={`feed-ic ${item.tone}`}>
                  <Icon name={item.icon} />
                </span>
                <div>
                  {/* the feed copy carries inline <b> emphasis, as in the original */}
                  <p dangerouslySetInnerHTML={{ __html: item.html }} />
                  <small>{item.time}</small>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}
