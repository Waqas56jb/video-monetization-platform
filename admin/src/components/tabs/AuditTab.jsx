import { useMemo, useState } from 'react'
import Panel from '@/components/ui/Panel'
import { EmptyRow, TableWrap } from '@/components/ui/Table'
import { ExportButton, FilterRow, SearchBar } from '@/components/ui/Filters'
import { AUDIT_LOG } from '@/data/adminData'

const MONO = { fontFamily: 'monospace', color: 'var(--muted)' }

export default function AuditTab() {
  const [query, setQuery] = useState('')

  const rows = useMemo(() => {
    const q = query.toLowerCase()
    return AUDIT_LOG.filter((a) =>
      [a.time, a.admin, a.action, a.object, a.target, a.ip].join(' ').toLowerCase().includes(q)
    )
  }, [query])

  return (
    <div className="tab">
      <Panel
        title="Admin Audit Log"
        action={
          <FilterRow>
            <SearchBar value={query} onChange={setQuery} placeholder="Search actions…" />
            <ExportButton />
          </FilterRow>
        }
      >
        <TableWrap>
          <thead>
            <tr>
              <th>Time</th>
              <th>Admin</th>
              <th>Action</th>
              <th>Target</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={5}>No audit entries match this search.</EmptyRow>}
            {rows.map((a) => (
              <tr key={a.id}>
                <td>{a.time}</td>
                <td>{a.admin}</td>
                <td>
                  <span className={`pill ${a.pill}`}>{a.action}</span> {a.object}
                </td>
                <td>{a.target}</td>
                <td style={MONO}>{a.ip}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Panel>
    </div>
  )
}
