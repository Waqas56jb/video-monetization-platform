import { useState } from 'react'
import { Users } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import { StatGrid } from '@/components/ui/StatCard'
import { EmptyRow, IconButton, TableWrap, UserCell } from '@/components/ui/Table'
import { FilterRow, FilterSelect, SearchBar } from '@/components/ui/Filters'
import { Async } from '@/components/ui/States'
import useApi, { useDebounced, tzs, compact, shortDate } from '@/hooks/useApi'
import api from '@/lib/api'
import { useConfirm } from '@/context/ConfirmContext'
import { useToast } from '@/context/ToastContext'

const PILL = { active: 'ok', blocked: 'bad', suspended: 'pend' }

/**
 * Every account on the platform.
 *
 * Blocking is not a flag on a screen: it goes to the database, and the API
 * re-reads the profile on the blocked person's very next request. They are out
 * immediately, not whenever their browser next reloads.
 *
 * Admin-only — a sub-admin cannot reach this page, and the route would refuse
 * them if they did.
 */
export default function UsersTab() {
  const confirm = useConfirm()
  const showToast = useToast()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [role, setRole] = useState('')

  // Debounce lives in the key: the effect refires when the typed value settles.
  const debounced = useDebounced(query, 300)

  const { data, loading, error, reload } = useApi(
    () => api.admin.users({ q: debounced, status: status.toLowerCase(), role: role.toLowerCase(), limit: 100 }),
    [debounced, status, role]
  )

  const rows = data?.users || []
  const stats = [
    { icon: 'users', label: 'Total Accounts', value: compact(rows.length) },
    { icon: 'user-check', label: 'Active', value: compact(rows.filter((u) => u.status === 'active').length) },
    { icon: 'video', label: 'Creators', value: compact(rows.filter((u) => u.role === 'creator').length) },
    { icon: 'ban', label: 'Blocked', value: compact(rows.filter((u) => u.status === 'blocked').length) },
  ]

  const setStatusOn = async (user, next, message) => {
    try {
      await api.admin.setUserStatus(user.id, { status: next })
      showToast(message)
      reload({ quiet: true })
    } catch (err) {
      showToast(err.message)
    }
  }

  const block = (user) =>
    confirm({
      title: `Block ${user.full_name || user.email}?`,
      text:
        'They lose access immediately, on their next request rather than their next reload. ' +
        'Anything they have already bought is untouched — you can restore them at any time.',
      onConfirm: () => setStatusOn(user, 'blocked', `${user.full_name || user.email} is blocked`),
    })

  return (
    <div className="tab">
      <StatGrid stats={stats} />

      <Panel
        title="All Users"
        action={
          <FilterRow>
            <SearchBar value={query} onChange={setQuery} placeholder="Search name, email, phone…" />
            <FilterSelect
              value={role}
              onChange={setRole}
              options={['Viewer', 'Creator']}
              allLabel="All Roles"
            />
            <FilterSelect
              value={status}
              onChange={setStatus}
              options={['Active', 'Blocked', 'Suspended']}
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
            icon: Users,
            title: query || status || role ? 'Nobody matches that' : 'No accounts yet',
            hint:
              query || status || role
                ? 'Try a different search or clear the filters.'
                : 'People appear here as soon as they register on the platform.',
          }}
        >
          <TableWrap>
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Phone</th>
                <th>Joined</th>
                <th>Purchases</th>
                <th>Total Spent</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <EmptyRow colSpan={8}>No users match this search.</EmptyRow>}
              {rows.map((u) => {
                const blocked = u.status === 'blocked'
                const staff = u.role === 'admin' || u.role === 'sub_admin'
                return (
                  <tr key={u.id} className={blocked ? 'blocked-row' : ''}>
                    <td>
                      <UserCell avatar={u.avatar_url} name={u.full_name || u.email} sub={u.email} />
                    </td>
                    <td>
                      <span className={`pill ${staff ? 'info' : u.role === 'creator' ? 'ok' : ''}`}>
                        {u.role === 'sub_admin' ? 'Sub-admin' : u.role}
                      </span>
                    </td>
                    <td>{u.phone || '—'}</td>
                    <td>{shortDate(u.created_at)}</td>
                    <td>{u.purchases ?? 0}</td>
                    <td className="money">{tzs(u.spent)}</td>
                    <td>
                      <span className={`pill ${PILL[u.status] || 'ok'}`}>{u.status}</span>
                    </td>
                    <td>
                      <div className="actions">
                        {staff ? (
                          // Staff accounts are managed in Settings, where the
                          // invitation and audit trail live together.
                          <span style={{ color: 'var(--muted2)', fontSize: 12 }}>Managed in Settings</span>
                        ) : blocked ? (
                          <IconButton
                            icon="rotate-ccw"
                            title="Restore access"
                            tone="good"
                            onClick={() =>
                              setStatusOn(u, 'active', `${u.full_name || u.email} can sign in again`)
                            }
                          />
                        ) : (
                          <IconButton
                            icon="ban"
                            title="Block user"
                            tone="danger"
                            onClick={() => block(u)}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </TableWrap>
        </Async>
      </Panel>
    </div>
  )
}
