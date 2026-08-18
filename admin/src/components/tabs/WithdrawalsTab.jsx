import { useMemo, useState } from 'react'
import { Banknote } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import { StatGrid } from '@/components/ui/StatCard'
import { EmptyRow, TableWrap, UserCell } from '@/components/ui/Table'
import { FilterRow, FilterSelect } from '@/components/ui/Filters'
import { Async } from '@/components/ui/States'
import useApi, { tzs, compact, dateTime } from '@/hooks/useApi'
import api from '@/lib/api'
import { useConfirm } from '@/context/ConfirmContext'
import { useToast } from '@/context/ToastContext'

const PILL = { pending: 'pend', paid: 'ok', rejected: 'bad' }
const STATUS_LABEL = {
  pending: 'Awaiting review',
  paid: 'Paid out',
  rejected: 'Declined',
}

/** Creator payout requests, and the decision on each. */
export default function WithdrawalsTab() {
  const confirm = useConfirm()
  const showToast = useToast()
  const [filter, setFilter] = useState('Pending')

  const { data, loading, error, reload } = useApi(() => api.admin.withdrawals(), [])
  const all = data?.withdrawals || []

  const rows = useMemo(
    () => (filter ? all.filter((w) => w.status === filter.toLowerCase()) : all),
    [all, filter]
  )

  const pending = all.filter((w) => w.status === 'pending')
  const stats = [
    { icon: 'hourglass', label: 'Awaiting Decision', value: compact(pending.length) },
    { icon: 'banknote', tone: 'gold', label: 'Pending Amount', value: tzs(pending.reduce((n, w) => n + w.amount_tzs, 0)) },
    { icon: 'check-circle-2', label: 'Paid Out', value: tzs(all.filter((w) => w.status === 'paid' || w.status === 'approved').reduce((n, w) => n + w.amount_tzs, 0)) },
    { icon: 'users', label: 'Creators Requesting', value: compact(new Set(pending.map((w) => w.creator_id)).size) },
  ]

  const decide = async (w, decision) => {
    try {
      await api.admin.decideWithdrawal(w.id, { decision })
      showToast(
        decision === 'paid'
          ? `${tzs(w.amount_tzs)} marked paid — sending via ${w.method === 'airtel' ? 'Airtel Money' : 'M-Pesa'}`
          : 'Withdrawal rejected'
      )
      reload({ quiet: true })
    } catch (err) {
      showToast(err.message)
    }
  }

  const reject = (w) =>
    confirm({
      title: 'Reject this withdrawal?',
      text: `${tzs(w.amount_tzs)} goes back into ${w.creator_name || 'the creator'}'s balance and they are told it was declined.`,
      onConfirm: () => decide(w, 'rejected'),
    })

  return (
    <div className="tab">
      <StatGrid stats={stats} />

      <Panel
        title="Withdrawal Requests"
        action={
          <FilterRow>
            <FilterSelect
              value={filter}
              onChange={setFilter}
              options={['Pending', 'Paid', 'Rejected']}
              allLabel="All Requests"
            />
          </FilterRow>
        }
      >
        <Async
          loading={loading}
          error={error}
          onRetry={reload}
          empty={!rows.length}
          rows={4}
          emptyProps={{
            icon: Banknote,
            title: filter === 'Pending' ? 'The queue is clear' : 'Nothing here',
            hint:
              filter === 'Pending'
                ? 'Payout requests appear here the moment a creator asks for one.'
                : 'Try a different filter.',
          }}
        >
          <TableWrap>
            <thead>
              <tr>
                <th>Creator</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Destination</th>
                <th>Lifetime Earned</th>
                <th>Requested</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <EmptyRow colSpan={8}>Nothing matches this filter.</EmptyRow>}
              {rows.map((w) => (
                <tr key={w.id}>
                  <td>
                    <UserCell avatar={w.avatar_url} name={w.creator_name || '—'} sub={`ID ${String(w.creator_id).slice(0, 8)}`} />
                  </td>
                  <td className="money">{tzs(w.amount_tzs)}</td>
                  <td>{w.method === 'airtel' ? 'Airtel Money' : 'M-Pesa'}</td>
                  <td>{w.phone || w.payout_phone || '—'}</td>
                  <td className="money">{tzs(w.lifetime_tzs)}</td>
                  <td>{dateTime(w.requested_at)}</td>
                  <td>
                    <span className={`pill ${PILL[w.status] ?? ''}`}>
                      {STATUS_LABEL[w.status] || w.status}
                    </span>
                  </td>
                  <td>
                    <div className="actions">
                      {w.status === 'pending' ? (
                        <>
                          <button className="btn btn-green btn-sm" onClick={() => decide(w, 'paid')}>
                            Mark paid
                          </button>
                          <button className="btn btn-red btn-sm" onClick={() => reject(w)}>
                            Reject
                          </button>
                        </>
                      ) : (
                        <span style={{ color: 'var(--muted2)', fontSize: 12 }}>
                          {w.decided_at ? `Decided ${dateTime(w.decided_at)}` : '—'}
                        </span>
                      )}
                    </div>
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
