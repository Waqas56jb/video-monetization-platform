import { useMemo, useState } from 'react'
import { CreditCard } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import { StatGrid } from '@/components/ui/StatCard'
import { EmptyRow, TableWrap } from '@/components/ui/Table'
import { FilterRow, FilterSelect, SearchBar } from '@/components/ui/Filters'
import { Async } from '@/components/ui/States'
import useApi, { tzs, compact, dateTime } from '@/hooks/useApi'
import api from '@/lib/api'

const MONO = { fontFamily: 'monospace', color: 'var(--muted)' }
const PILL = { success: 'ok', pending: 'pend', failed: 'bad', cancelled: '', expired: '' }
const METHOD = { mpesa: 'M-Pesa', airtel: 'Airtel Money', card: 'Card' }

/** Every transaction, as it happened. */
export default function PaymentsTab() {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')

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
              options={['Success', 'Pending', 'Failed', 'Cancelled']}
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
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <EmptyRow colSpan={8}>No transactions match this search.</EmptyRow>}
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
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Async>
      </Panel>
    </div>
  )
}
