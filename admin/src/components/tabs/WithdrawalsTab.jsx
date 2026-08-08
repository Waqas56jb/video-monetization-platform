import Panel from '@/components/ui/Panel'
import { StatGrid } from '@/components/ui/StatCard'
import { EmptyRow, TableWrap, UserCell, rowClass } from '@/components/ui/Table'
import { useAdminData } from '@/context/AdminDataContext'
import { useConfirm } from '@/context/ConfirmContext'
import { useToast } from '@/context/ToastContext'
import { CONFIRM, RECENT_PAYOUTS, TOASTS, WITHDRAWAL_STATS } from '@/data/adminData'

export default function WithdrawalsTab() {
  const { withdrawals } = useAdminData()
  const confirm = useConfirm()
  const showToast = useToast()

  const markPaid = (row) => {
    withdrawals.remove(row.id)
    showToast(TOASTS.markPaid)
  }

  const reject = (row) =>
    confirm({
      ...CONFIRM.rejectWithdrawal,
      onConfirm: () => {
        withdrawals.remove(row.id)
        showToast(TOASTS.withdrawalRejected)
      },
    })

  return (
    <div className="tab">
      <StatGrid stats={WITHDRAWAL_STATS} />

      <Panel title="Withdrawal Queue" action={<span className="link">Manual payouts (V1)</span>}>
        <TableWrap>
          <thead>
            <tr>
              <th>Creator</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Number</th>
              <th>Balance After</th>
              <th>Requested</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {withdrawals.items.length === 0 && (
              <EmptyRow colSpan={7}>Queue cleared — no withdrawals waiting.</EmptyRow>
            )}
            {withdrawals.items.map((w) => (
              <tr key={w.id} className={rowClass(w, false)}>
                <td>
                  <UserCell avatar={w.avatar} name={w.name} sub={w.sub} />
                </td>
                <td className="money">{w.amount}</td>
                <td>{w.method}</td>
                <td>{w.number}</td>
                <td>{w.balanceAfter}</td>
                <td>{w.requested}</td>
                <td>
                  <div className="actions">
                    <button className="btn btn-green btn-sm" onClick={() => markPaid(w)}>
                      Mark Paid
                    </button>
                    <button className="btn btn-red btn-sm" onClick={() => reject(w)}>
                      Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Panel>

      <Panel title="Recent Payouts">
        <TableWrap>
          <thead>
            <tr>
              <th>Creator</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Approved By</th>
              <th>Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {RECENT_PAYOUTS.map((p) => (
              <tr key={p.id}>
                <td>{p.creator}</td>
                <td className="money">{p.amount}</td>
                <td>{p.method}</td>
                <td>{p.approvedBy}</td>
                <td>{p.date}</td>
                <td>
                  <span className="pill ok">Paid</span>
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Panel>
    </div>
  )
}
