import { useState } from 'react'
import { ScrollText } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import { EmptyRow, TableWrap } from '@/components/ui/Table'
import { FilterRow, SearchBar } from '@/components/ui/Filters'
import { Async } from '@/components/ui/States'
import useApi, { useDebounced, dateTime } from '@/hooks/useApi'
import api from '@/lib/api'

const MONO = { fontFamily: 'monospace', color: 'var(--muted)' }

/**
 * Every action, permanently recorded — the client's words.
 *
 * The name and email are read back through a join, and the entry survives the
 * account being deleted: the actor id goes null but the action, its target and
 * its timestamp stay. A record of who did what must not vanish with the person.
 */
const toneFor = (action = '') => {
  if (/APPROVE|PUBLISH|VERIFIED|ACTIVATED/.test(action)) return 'ok'
  if (/REJECT|REMOVE|BLOCK|DELET|SUSPEND/.test(action)) return 'bad'
  if (/CHANGE|SPLIT|SETTINGS/.test(action)) return 'pend'
  return 'info'
}

export default function AuditTab() {
  const [query, setQuery] = useState('')
  const debounced = useDebounced(query, 300)

  const { data, loading, error, reload } = useApi(
    () => api.admin.audit({ q: debounced, limit: 200 }),
    [debounced]
  )
  const rows = data?.entries || []

  return (
    <div className="tab">
      <Panel
        title="Audit Log"
        action={
          <FilterRow>
            <SearchBar value={query} onChange={setQuery} placeholder="Search actions, people…" />
          </FilterRow>
        }
      >
        <Async
          loading={loading}
          error={error}
          onRetry={reload}
          empty={!rows.length}
          rows={8}
          emptyProps={{
            icon: ScrollText,
            title: query ? 'Nothing matches that' : 'Nothing recorded yet',
            hint: query
              ? 'Try a different search.'
              : 'Every action taken by an administrator or sub-admin is written here as it happens.',
          }}
        >
          <TableWrap>
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Action</th>
                <th>Target</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <EmptyRow colSpan={5}>No audit entries match this search.</EmptyRow>}
              {rows.map((a) => (
                <tr key={a.id}>
                  <td>{dateTime(a.created_at)}</td>
                  <td>
                    <b>{a.actor_name || 'System'}</b>
                    {a.actor_email && (
                      <small style={{ display: 'block', color: 'var(--muted2)', fontSize: 11 }}>
                        {a.actor_email}
                      </small>
                    )}
                  </td>
                  <td>
                    <span className={`pill ${toneFor(a.action)}`}>{a.action.replace(/_/g, ' ')}</span>
                  </td>
                  <td>
                    {a.entity_type || '—'}
                    {a.entity_id && (
                      <small style={{ display: 'block', ...MONO, fontSize: 11 }}>
                        {String(a.entity_id).slice(0, 12)}
                      </small>
                    )}
                  </td>
                  <td style={MONO}>{a.ip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Async>
      </Panel>
    </div>
  )
}
