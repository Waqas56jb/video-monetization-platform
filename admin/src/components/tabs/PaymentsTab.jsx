import { useMemo, useState } from 'react'
import { CreditCard, Undo2 } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import { StatGrid } from '@/components/ui/StatCard'
import { EmptyRow, TableWrap } from '@/components/ui/Table'
import { FilterRow, FilterSelect, SearchBar } from '@/components/ui/Filters'
import { Async } from '@/components/ui/States'
import useApi, { tzs, compact, dateTime } from '@/hooks/useApi'
import api from '@/lib/api'
import { useToast } from '@/context/ToastContext'
import { useAuth } from '@/context/AuthContext'

const MONO = { fontFamily: 'monospace', color: 'var(--muted)' }
const PILL = { success: 'ok', pending: 'pend', failed: 'bad', cancelled: '', expired: '', refunded: 'pend' }
const METHOD = { mpesa: 'M-Pesa', airtel: 'Airtel Money', card: 'Card' }

/** Every transaction, as it happened. */
export default function PaymentsTab() {
  const showToast = useToast()
  const { isAdmin } = useAuth()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [busyId, setBusyId] = useState(null)

  const { data, loading, error, reload } = useApi(
    () => api.admin.payments({ status: status.toLowerCase(), limit: 200 }),
    [status]
  )

  const all = data?.payments || []

  // Filtering by text happens here rather than on the server: the result set is
  // already capped at 200 rows, and this keeps typing instant.
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return all
    return all.filter((p) =>
      [p.id, p.user_name, p.video_title, p.method, p.provider_reference]
        .join(' ')
        .toLowerCase()
        .includes(q)
    )
  }, [all, query])

  /**
   * Record a refund.
   *
   * The money itself is returned by hand in the provider's portal — nothing here
   * can move it. What this does is make the platform agree with what happened:
   * the payment reads refunded, the buyer loses access, and the creator's credit
   * is reversed so they cannot withdraw against a sale that no longer exists.
   */
  const refund = async (p) => {
    const reason = window.prompt(
      `Refund ${tzs(p.amount_tzs)} to ${p.user_name || p.user_email || 'this customer'}?\n\n` +
        'This removes their access to the video and reverses the creator’s share.\n' +
        'It does NOT send the money back — do that in the provider’s portal.\n\n' +
        'Reason (the customer sees this):'
    )
    if (reason === null) return

    setBusyId(p.id)
    try {
      const res = await api.admin.refundPayment(p.id, reason.trim() || undefined)
      showToast(res.message || 'Refund recorded')
      reload({ quiet: true })
    } catch (err) {
      showToast(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const succeeded = all.filter((p) => p.status === 'success')
  const stats = [
    { icon: 'credit-card', label: 'Transactions', value: compact(all.length) },
    { icon: 'check-circle-2', label: 'Successful', value: compact(succeeded.length) },
    { icon: 'coins', tone: 'gold', label: 'Collected', value: tzs(succeeded.reduce((n, p) => n + (p.amount_tzs || 0), 0)) },
    { icon: 'hourglass', label: 'Pending', value: compact(all.filter((p) => p.status === 'pending').length) },
  ]

  return (
    <div className="tab">
      <StatGrid stats={stats} />

      <Panel
        title="All Transactions"
        action={
          <FilterRow>
            <SearchBar value={query} onChange={setQuery} placeholder="Search reference, user, video…" />
            <FilterSelect
              value={status}
              onChange={setStatus}
              options={['Success', 'Pending', 'Failed', 'Cancelled', 'Refunded']}
              allLabel="All Status"
            />
          </FilterRow>
        }
      >
        <Async
          loading={loading}
          error={error}
          onRetry={reload}
          empty={!rows.length}
          rows={6}
          emptyProps={{
            icon: CreditCard,
            title: query || status ? 'Nothing matches that' : 'No transactions yet',
            hint:
              query || status
                ? 'Try a different search or clear the filter.'
                : 'Every purchase lands here the moment it is attempted, successful or not.',
          }}
        >
          <TableWrap>
            <thead>
              <tr>
                <th>Reference</th>
                <th>User</th>
                <th>Video</th>
                <th>Method</th>
                <th>Amount</th>
                <th>Split (C/P)</th>
                <th>When</th>
                <th>Status</th>
                {isAdmin && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <EmptyRow colSpan={isAdmin ? 9 : 8}>No transactions match this search.</EmptyRow>
              )}
              {rows.map((p) => (
                <tr key={p.id}>
                  <td style={MONO}>{(p.provider_reference || p.id).slice(0, 14)}</td>
                  <td>{p.user_name || '—'}</td>
                  <td>{p.video_title || '—'}</td>
                  <td>{METHOD[p.method] || p.method}</td>
                  <td className="money">{tzs(p.amount_tzs)}</td>
                  <td>
                    {p.creator_amount_tzs != null
                      ? `${tzs(p.creator_amount_tzs)} / ${tzs(p.platform_amount_tzs)}`
                      : '—'}
                  </td>
                  <td>{dateTime(p.created_at)}</td>
                  <td>
                    <span className={`pill ${PILL[p.status] ?? ''}`}>{p.status}</span>
                  </td>
                  {/* Refunding is money leaving the platform, so it stays with
                      the administrator rather than the moderation team. */}
                  {isAdmin && (
                    <td>
                      {p.status === 'success' && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => refund(p)}
                          disabled={busyId === p.id}
                          title="Record a refund and remove access"
                        >
                          <Undo2 size={14} />
                          <span className="btn-label">
                            {busyId === p.id ? 'Refunding…' : 'Refund'}
                          </span>
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Async>
      </Panel>
    </div>
  )
}
