import { useState } from 'react'
import { Clapperboard } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import { StatGrid } from '@/components/ui/StatCard'
import { EmptyRow, IconButton, TableWrap, VideoCell } from '@/components/ui/Table'
import { FilterRow, FilterSelect, SearchBar } from '@/components/ui/Filters'
import { Async } from '@/components/ui/States'
import useApi, { useDebounced, tzs, compact } from '@/hooks/useApi'
import api from '@/lib/api'
import { useConfirm } from '@/context/ConfirmContext'
import { useToast } from '@/context/ToastContext'

const STATUS_FILTERS = {
  Published: 'published',
  Unpublished: 'unpublished',
  'Awaiting review': 'pending_review',
  Rejected: 'rejected',
  Removed: 'deleted',
}

const ACCESS_LABEL = {
  ppv_forever: 'Pay once',
  paid_premiere: 'Premiere',
  free_with_ads: 'Free + ads',
}

/**
 * Every video on the platform.
 *
 * Removal here is a soft delete and always will be: somebody paid for that
 * video, and their purchase must not vanish underneath them. The database
 * refuses a hard delete outright when there are active purchases.
 */
export default function VideosTab() {
  const confirm = useConfirm()
  const showToast = useToast()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const debounced = useDebounced(query, 300)

  const { data, loading, error, reload } = useApi(
    () => api.admin.videos({ q: debounced, status: STATUS_FILTERS[status], limit: 100 }),
    [debounced, status]
  )

  const rows = data?.videos || []
  const stats = [
    { icon: 'clapperboard', label: 'Videos', value: compact(rows.length) },
    { icon: 'eye', label: 'Total Views', value: compact(rows.reduce((n, v) => n + (v.views || 0), 0)) },
    { icon: 'ticket', label: 'Paid Unlocks', value: compact(rows.reduce((n, v) => n + (v.paidUnlocks || 0), 0)) },
    { icon: 'shield-check', label: 'Published', value: compact(rows.filter((v) => v.isPublished).length) },
  ]

  const act = async (fn, message) => {
    try {
      await fn()
      showToast(message)
      reload({ quiet: true })
    } catch (err) {
      showToast(err.message)
    }
  }

  const unpublish = (v) =>
    confirm({
      title: `Unpublish "${v.title}"?`,
      text:
        'It disappears from the public site straight away. Anyone who already bought it keeps ' +
        'their access — that never changes.',
      onConfirm: () => act(() => api.admin.unpublish(v.id), 'Unpublished — buyers keep their access'),
    })

  const remove = (v) =>
    confirm({
      title: `Remove "${v.title}"?`,
      text:
        v.buyers > 0
          ? `${v.buyers} person(s) have bought this. It will be hidden everywhere, but their purchase and their access survive — the row is never actually destroyed.`
          : 'It will be hidden everywhere. Nothing is destroyed; the record stays for the audit trail.',
      onConfirm: () => act(() => api.admin.removeVideo(v.id), 'Video removed'),
    })

  return (
    <div className="tab">
      <StatGrid stats={stats} />

      <Panel
        title="All Videos"
        action={
          <FilterRow>
            <SearchBar value={query} onChange={setQuery} placeholder="Search by title…" />
            <FilterSelect
              value={status}
              onChange={setStatus}
              options={Object.keys(STATUS_FILTERS)}
              allLabel="All Videos"
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
            icon: Clapperboard,
            title: query || status ? 'Nothing matches that' : 'No videos yet',
            hint:
              query || status
                ? 'Try a different search or clear the filter.'
                : 'Videos appear here as soon as a creator uploads one.',
          }}
        >
          <TableWrap>
            <thead>
              <tr>
                <th>Video</th>
                <th>Creator</th>
                <th>Access</th>
                <th>Price</th>
                <th>Views</th>
                <th>Buyers</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <EmptyRow colSpan={8}>No videos match this search.</EmptyRow>}
              {rows.map((v) => {
                const removed = Boolean(v.deletedAt)
                return (
                  <tr key={v.id} className={removed || !v.isPublished ? 'blocked-row' : ''}>
                    <td>
                      <VideoCell thumb={v.thumbnailUrl} title={v.title} meta={v.category} />
                    </td>
                    <td>{v.creatorName || v.creator?.name || '—'}</td>
                    <td>
                      <span className="pill free">{ACCESS_LABEL[v.accessType] || v.accessType}</span>
                    </td>
                    <td>{v.accessType === 'free_with_ads' ? 'Free' : tzs(v.priceTzs)}</td>
                    <td>{compact(v.views)}</td>
                    <td>{v.buyers ?? 0}</td>
                    <td>{statusPill(v)}</td>
                    <td>
                      <div className="actions">
                        {v.isPublished && !removed && (
                          <IconButton
                            icon="eye-off"
                            title="Unpublish"
                            onClick={() => unpublish(v)}
                          />
                        )}
                        {!v.isPublished && v.reviewStatus === 'approved' && !removed && (
                          <IconButton
                            icon="upload-cloud"
                            title="Publish"
                            tone="good"
                            onClick={() => act(() => api.admin.publish(v.id), 'Published')}
                          />
                        )}
                        {!removed && (
                          <IconButton
                            icon="trash-2"
                            title="Remove video"
                            tone="danger"
                            onClick={() => remove(v)}
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

function statusPill(v) {
  if (v.deletedAt) return <span className="pill bad">Removed</span>
  if (v.reviewStatus === 'rejected') return <span className="pill bad">Rejected</span>
  if (v.reviewStatus === 'pending_review') return <span className="pill pend">Awaiting review</span>
  if (v.isPublished) return <span className="pill ok">Published</span>
  return <span className="pill">Unpublished</span>
}
