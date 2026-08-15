import { useState } from 'react'
import { ScrollText } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import { EmptyRow, TableWrap } from '@/components/ui/Table'
import { FilterRow, FilterSelect, SearchBar } from '@/components/ui/Filters'
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

const PAGE = 50

export default function AuditTab() {
  const [query, setQuery] = useState('')
  const [action, setAction] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(0)
  const debounced = useDebounced(query, 300)

  /**
   * Filtering happens on the server.
   *
   * This used to ask for the newest two hundred rows and search them in the
   * browser, which quietly means the answer is only ever "of the last two
   * hundred". On a log that only grows, "what did this person do in March"
   * could not be answered at all. Every filter below is a WHERE clause against
   * an index now, and the page moves through the whole table.
   */
  const { data, loading, error, reload } = useApi(
    () =>
      api.admin.audit({
        q: debounced,
        action,
        from,
        to,
        limit: PAGE,
        offset: page * PAGE,
      }),
    [debounced, action, from, to, page]
  )
  const rows = data?.entries || []
  const total = data?.total ?? 0
  const filtered = Boolean(debounced || action || from || to)

  /* Changing a filter starts again from the first page — staying on page 4 of
     a result set that now has one page shows an empty table that looks broken. */
  const change = (setter) => (value) => {
    setter(value)
    setPage(0)
  }

  return (
    <div className="tab">
      <Panel
        title={`Audit Log${total ? ` · ${total.toLocaleString()}` : ''}`}
        action={
          <FilterRow>
            <SearchBar
              value={query}
              onChange={change(setQuery)}
              placeholder="Search actions, people…"
            />
            <FilterSelect
              value={action}
              onChange={change(setAction)}
              options={data?.options?.actions || []}
              allLabel="All actions"
            />
            <input
              type="date"
              className="date-filter"
              value={from}
              max={to || undefined}
              onChange={(e) => change(setFrom)(e.target.value)}
              aria-label="From date"
            />
            <input
              type="date"
              className="date-filter"
              value={to}
              min={from || undefined}
              onChange={(e) => change(setTo)(e.target.value)}
              aria-label="To date"
            />
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
            title: filtered ? 'Nothing matches that' : 'Nothing recorded yet',
            hint: filtered
              ? 'Try a different search, action or date range.'
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

          {/* Only shown when there is more than one page — a pager under six
              rows is furniture. */}
          {total > PAGE && (
            <div className="pager">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || loading}
              >
                Previous
              </button>
              <span>
                {page * PAGE + 1}–{Math.min((page + 1) * PAGE, total)} of {total.toLocaleString()}
              </span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={(page + 1) * PAGE >= total || loading}
              >
                Next
              </button>
            </div>
          )}
        </Async>
      </Panel>
    </div>
  )
}
