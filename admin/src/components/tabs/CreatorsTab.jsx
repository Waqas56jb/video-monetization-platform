import { useMemo, useState } from 'react'
import { Video } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import { StatGrid } from '@/components/ui/StatCard'
import { EmptyRow, IconButton, TableWrap, UserCell } from '@/components/ui/Table'
import { FilterRow, FilterSelect, SearchBar } from '@/components/ui/Filters'
import { Async } from '@/components/ui/States'
import useApi, { tzs, compact } from '@/hooks/useApi'
import api from '@/lib/api'
import { useConfirm } from '@/context/ConfirmContext'
import { useToast } from '@/context/ToastContext'

/**
 * The creators, and what they have actually earned.
 *
 * "Split" is the share this creator keeps. Most sit on the platform default;
 * an override is marked, because a quiet per-creator deal is exactly the kind
 * of thing that should never be invisible.
 */
export default function CreatorsTab() {
  const confirm = useConfirm()
  const showToast = useToast()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('')

  const { data, loading, error, reload } = useApi(() => api.admin.creators(), [])
  const settings = useApi(() => api.admin.settings(), [])
  const defaultSplit = settings.data?.settings?.creator_split_percent ?? 70

  const all = data?.creators || []

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all.filter((c) => {
      const name = (c.display_name || c.full_name || '').toLowerCase()
      const matches = !q || name.includes(q) || (c.email || '').toLowerCase().includes(q)
      if (!matches) return false
      if (filter === 'Verified') return c.verified
      if (filter === 'Unverified') return !c.verified
      if (filter === 'Suspended') return c.status !== 'active'
      return true
    })
  }, [all, query, filter])

  const stats = [
    { icon: 'video', label: 'Creators', value: compact(all.length) },
    { icon: 'badge-check', label: 'Verified', value: compact(all.filter((c) => c.verified).length) },
    { icon: 'clapperboard', label: 'Videos', value: compact(all.reduce((n, c) => n + (c.videos || 0), 0)) },
    {
      icon: 'coins',
      tone: 'gold',
      label: 'Paid to Creators',
      value: tzs(all.reduce((n, c) => n + (c.lifetime_tzs || 0), 0)),
    },
  ]

  const verify = async (c, verified) => {
    try {
      await api.admin.verifyCreator(c.id, verified)
      showToast(
        verified
          ? `${c.display_name || c.full_name} is now verified`
          : 'Verified badge removed'
      )
      reload({ quiet: true })
    } catch (err) {
      showToast(err.message)
    }
  }

  const editSplit = (c) => {
    const current = c.revenue_split_percent ?? defaultSplit
    const answer = window.prompt(
      `What share should ${c.display_name || c.full_name} keep, as a percentage?\n\n` +
        `The platform default is ${defaultSplit}%. Leave blank to put them back on it.`,
      String(current)
    )
    if (answer === null) return

    const trimmed = answer.trim()
    const value = trimmed === '' ? null : Number(trimmed)
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > 100)) {
      return showToast('Enter a number between 0 and 100, or leave it blank')
    }

    api.admin
      .setCreatorSplit(c.id, value)
      .then(() => {
        showToast(value === null ? `Back on the ${defaultSplit}% default` : `Split set to ${value}%`)
        reload({ quiet: true })
      })
      .catch((err) => showToast(err.message))
  }

  const suspend = (c) =>
    confirm({
      title: `Suspend ${c.display_name || c.full_name}?`,
      text:
        'They can still sign in and their videos stay up, but they cannot upload or change ' +
        'anything until you restore them.',
      onConfirm: async () => {
        try {
          await api.admin.setUserStatus(c.id, { status: 'suspended' })
          showToast('Creator suspended')
          reload({ quiet: true })
        } catch (err) {
          showToast(err.message)
        }
      },
    })

  const restore = async (c) => {
    try {
      await api.admin.setUserStatus(c.id, { status: 'active' })
      showToast('Creator restored')
      reload({ quiet: true })
    } catch (err) {
      showToast(err.message)
    }
  }

  return (
    <div className="tab">
      <StatGrid stats={stats} />

      <Panel
        title="All Creators"
        action={
          <FilterRow>
            <SearchBar value={query} onChange={setQuery} placeholder="Search creators…" />
            <FilterSelect
              value={filter}
              onChange={setFilter}
              options={['Verified', 'Unverified', 'Suspended']}
              allLabel="All Creators"
            />
          </FilterRow>
        }
      >
        <Async
          loading={loading}
          error={error}
          onRetry={reload}
          empty={!rows.length}
          rows={5}
          emptyProps={{
            icon: Video,
            title: query || filter ? 'Nobody matches that' : 'No creators yet',
            hint:
              query || filter
                ? 'Try a different search.'
                : 'Anyone approved to publish appears here.',
          }}
        >
          <TableWrap>
            <thead>
              <tr>
                <th>Creator</th>
                <th>Videos</th>
                <th>Followers</th>
                <th>Lifetime Earnings</th>
                <th>Split</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <EmptyRow colSpan={7}>No creators match this search.</EmptyRow>}
              {rows.map((c) => {
                const suspended = c.status !== 'active'
                const custom = c.revenue_split_percent != null
                return (
                  <tr key={c.id} className={suspended ? 'blocked-row' : ''}>
                    <td>
                      <UserCell
                        avatar={c.avatar_url}
                        name={c.display_name || c.full_name || c.email}
                        sub={c.email}
                      />
                    </td>
                    <td>{c.videos ?? 0}</td>
                    <td>{compact(c.followers)}</td>
                    <td className="money">{tzs(c.lifetime_tzs)}</td>
                    <td>
                      {(c.revenue_split_percent ?? defaultSplit)}%
                      {custom && (
                        <span className="pill info" style={{ marginLeft: 4 }}>
                          custom
                        </span>
                      )}
                    </td>
                    <td>
                      {suspended ? (
                        <span className="pill bad">{c.status}</span>
                      ) : c.verified ? (
                        <span className="pill ok">Verified</span>
                      ) : (
                        <span className="pill pend">Unverified</span>
                      )}
                    </td>
                    <td>
                      <div className="actions">
                        <IconButton
                          icon="badge-check"
                          title={c.verified ? 'Remove verified badge' : 'Verify creator'}
                          tone={c.verified ? '' : 'good'}
                          onClick={() => verify(c, !c.verified)}
                        />
                        <IconButton icon="percent" title="Change split" onClick={() => editSplit(c)} />
                        {suspended ? (
                          <IconButton
                            icon="rotate-ccw"
                            title="Restore"
                            tone="good"
                            onClick={() => restore(c)}
                          />
                        ) : (
                          <IconButton
                            icon="pause"
                            title="Suspend"
                            tone="danger"
                            onClick={() => suspend(c)}
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
