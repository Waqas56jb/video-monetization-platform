import { useMemo, useState } from 'react'
import Panel from '@/components/ui/Panel'
import { StatGrid } from '@/components/ui/StatCard'
import { EmptyRow, IconButton, TableWrap, UserCell, rowClass } from '@/components/ui/Table'
import { ExportButton, FilterRow, FilterSelect, SearchBar } from '@/components/ui/Filters'
import { useAdminData } from '@/context/AdminDataContext'
import { useConfirm } from '@/context/ConfirmContext'
import { useToast } from '@/context/ToastContext'
import { CONFIRM, TOASTS, USER_STATS } from '@/data/adminData'

const STATUS_PILL = { Active: 'ok', Blocked: 'bad' }

export default function UsersTab() {
  const { users } = useAdminData()
  const confirm = useConfirm()
  const showToast = useToast()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')

  // Same matching rules as the original: free-text over the whole row,
  // and the status select matched against the row's status pill.
  const rows = useMemo(() => {
    const q = query.toLowerCase()
    const s = status.toLowerCase()
    return users.items.filter((u) => {
      const haystack = [u.name, u.email, u.phone, u.joined, u.purchases, u.spent, u.status]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q) && (!s || u.status.toLowerCase().includes(s))
    })
  }, [users.items, query, status])

  const block = (user) =>
    confirm({
      ...CONFIRM.blockUser(user.name),
      onConfirm: () => {
        users.patch(user.id, { status: 'Blocked' })
        showToast(TOASTS.blocked)
      },
    })

  const unblock = (user) => {
    users.patch(user.id, { status: 'Active' })
    showToast(TOASTS.unblocked)
  }

  const del = (user) =>
    confirm({
      ...CONFIRM.deleteUser,
      onConfirm: () => {
        users.remove(user.id)
        showToast(TOASTS.deleted)
      },
    })

  return (
    <div className="tab">
      <StatGrid stats={USER_STATS} />

      <Panel
        title="All Users"
        action={
          <FilterRow>
            <SearchBar
              value={query}
              onChange={setQuery}
              placeholder="Search name, email, phone…"
            />
            <FilterSelect
              value={status}
              onChange={setStatus}
              options={['Active', 'Blocked']}
              allLabel="All Status"
            />
            <ExportButton />
          </FilterRow>
        }
      >
        <TableWrap>
          <thead>
            <tr>
              <th>User</th>
              <th>Phone</th>
              <th>Joined</th>
              <th>Purchases</th>
              <th>Total Spent</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={7}>No users match this search.</EmptyRow>}
            {rows.map((u) => {
              const blocked = u.status === 'Blocked'
              return (
                <tr key={u.id} className={rowClass(u, blocked)}>
                  <td>
                    <UserCell avatar={u.avatar} name={u.name} sub={u.email} />
                  </td>
                  <td>{u.phone}</td>
                  <td>{u.joined}</td>
                  <td>{u.purchases}</td>
                  <td className="money">{u.spent}</td>
                  <td>
                    <span className={`pill ${STATUS_PILL[u.status] || 'ok'}`}>{u.status}</span>
                  </td>
                  <td>
                    <div className="actions">
                      <IconButton
                        icon="eye"
                        title="View profile"
                        onClick={() => showToast(TOASTS.viewProfile)}
                      />
                      {blocked ? (
                        <IconButton
                          icon="rotate-ccw"
                          title="Unblock"
                          tone="good"
                          onClick={() => unblock(u)}
                        />
                      ) : (
                        <IconButton
                          icon="ban"
                          title="Block user"
                          tone="danger"
                          onClick={() => block(u)}
                        />
                      )}
                      <IconButton
                        icon="trash-2"
                        title="Delete user"
                        tone="danger"
                        onClick={() => del(u)}
                      />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </TableWrap>
      </Panel>
    </div>
  )
}
