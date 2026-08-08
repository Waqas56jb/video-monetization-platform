import { useMemo, useState } from 'react'
import Panel from '@/components/ui/Panel'
import { StatGrid } from '@/components/ui/StatCard'
import { EmptyRow, IconButton, TableWrap, UserCell, rowClass } from '@/components/ui/Table'
import { FilterRow, FilterSelect, SearchBar } from '@/components/ui/Filters'
import { useAdminData } from '@/context/AdminDataContext'
import { useConfirm } from '@/context/ConfirmContext'
import { useToast } from '@/context/ToastContext'
import { CONFIRM, CREATOR_STATS, TOASTS } from '@/data/adminData'

const STATUS_PILL = { Verified: 'ok', Pending: 'pend', Suspended: 'bad' }

export default function CreatorsTab() {
  const { creators } = useAdminData()
  const confirm = useConfirm()
  const showToast = useToast()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')

  const rows = useMemo(() => {
    const q = query.toLowerCase()
    const s = status.toLowerCase()
    return creators.items.filter((c) => {
      const haystack = [c.name, c.sub, c.videos, c.followers, c.revenue, c.balance, c.split, c.status]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q) && (!s || c.status.toLowerCase().includes(s))
    })
  }, [creators.items, query, status])

  const verify = (creator) => {
    creators.patch(creator.id, { status: 'Verified' })
    showToast(TOASTS.creatorVerified)
  }

  const suspend = (creator) =>
    confirm({
      ...CONFIRM.suspendCreator,
      onConfirm: () => {
        creators.patch(creator.id, { status: 'Suspended' })
        showToast(TOASTS.suspended)
      },
    })

  return (
    <div className="tab">
      <StatGrid stats={CREATOR_STATS} />

      <Panel
        title="All Creators"
        action={
          <FilterRow>
            <SearchBar value={query} onChange={setQuery} placeholder="Search creators…" />
            <FilterSelect
              value={status}
              onChange={setStatus}
              options={['Verified', 'Pending', 'Suspended']}
              allLabel="All Status"
            />
          </FilterRow>
        }
      >
        <TableWrap>
          <thead>
            <tr>
              <th>Creator</th>
              <th>Videos</th>
              <th>Followers</th>
              <th>Lifetime Revenue</th>
              <th>Balance</th>
              <th>Split</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={8}>No creators match this search.</EmptyRow>}
            {rows.map((c) => {
              const suspended = c.status === 'Suspended'
              return (
                <tr key={c.id} className={rowClass(c, suspended)}>
                  <td>
                    <UserCell avatar={c.avatar} name={c.name} sub={c.sub} />
                  </td>
                  <td>{c.videos}</td>
                  <td>{c.followers}</td>
                  <td className="money">{c.revenue}</td>
                  <td className="money">{c.balance}</td>
                  <td>
                    {c.split}{' '}
                    {c.custom && (
                      <span className="pill info" style={{ marginLeft: 4 }}>
                        custom
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`pill ${STATUS_PILL[c.status] || 'ok'}`}>{c.status}</span>
                  </td>
                  <td>
                    <div className="actions">
                      {c.status === 'Pending' && (
                        <IconButton
                          icon="badge-check"
                          title="Verify creator"
                          tone="good"
                          onClick={() => verify(c)}
                        />
                      )}
                      <IconButton
                        icon="eye"
                        title="View creator"
                        onClick={() => showToast(TOASTS.viewCreator)}
                      />
                      {c.status !== 'Pending' && (
                        <IconButton
                          icon="percent"
                          title="Edit split"
                          onClick={() => showToast(TOASTS.splitEditor)}
                        />
                      )}
                      <IconButton
                        icon="pause"
                        title="Suspend"
                        tone="danger"
                        onClick={() => suspend(c)}
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
