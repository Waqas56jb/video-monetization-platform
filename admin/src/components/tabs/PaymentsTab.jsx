import { useMemo, useState } from 'react'
import Panel from '@/components/ui/Panel'
import { StatGrid } from '@/components/ui/StatCard'
import { EmptyRow, TableWrap } from '@/components/ui/Table'
import { ExportButton, FilterRow, FilterSelect, SearchBar } from '@/components/ui/Filters'
import { PAYMENTS, PAYMENT_STATS } from '@/data/adminData'

const MONO = { fontFamily: 'monospace', color: 'var(--muted)' }

export default function PaymentsTab() {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')

  const rows = useMemo(() => {
    const q = query.toLowerCase()
    const s = status.toLowerCase()
    return PAYMENTS.filter((p) => {
      const haystack = [p.id, p.user, p.video, p.method, p.amount, p.split, p.date, p.status]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q) && (!s || p.status.toLowerCase().includes(s))
    })
  }, [query, status])

  return (
    <div className="tab">
      <StatGrid stats={PAYMENT_STATS} />

      <Panel
        title="All Transactions"
        action={
          <FilterRow>
            <SearchBar value={query} onChange={setQuery} placeholder="Search TX ID, user, video…" />
            <FilterSelect
              value={status}
              onChange={setStatus}
              options={['Completed', 'Pending', 'Failed']}
              allLabel="All Status"
            />
            <ExportButton label="Export CSV" />
          </FilterRow>
        }
      >
        <TableWrap>
          <thead>
            <tr>
              <th>TX ID</th>
              <th>User</th>
              <th>Video</th>
              <th>Method</th>
              <th>Amount</th>
              <th>Split (C/P)</th>
              <th>Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={8}>No transactions match this search.</EmptyRow>}
            {rows.map((p) => (
              <tr key={p.id}>
                <td style={MONO}>{p.id}</td>
                <td>{p.user}</td>
                <td>{p.video}</td>
                <td>{p.method}</td>
                <td className="money">{p.amount}</td>
                <td>{p.split}</td>
                <td>{p.date}</td>
                <td>
                  <span className={`pill ${p.pill}`}>{p.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Panel>
    </div>
  )
}
