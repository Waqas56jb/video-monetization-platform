import { useState } from 'react'
import { Clapperboard } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import { StatGrid } from '@/components/ui/StatCard'
import { EmptyRow, IconButton, TableWrap, VideoCell } from '@/components/ui/Table'
import { FilterRow, FilterSelect, SearchBar } from '@/components/ui/Filters'
import { Async } from '@/components/ui/States'
import useApi, { useDebounced, tzs, compact } from '@/hooks/useApi'
import api, { mediaUrl } from '@/lib/api'
import { useConfirm } from '@/context/ConfirmContext'
import { useToast } from '@/context/ToastContext'
import VideoPreview from '@/components/ui/VideoPreview'

const STATUS_FILTERS = {
  Published: 'published',
  Featured: 'featured',
  Unpublished: 'unpublished',
  'Awaiting review': 'pending_review',
  'Changes requested': 'changes_requested',
  Rejected: 'rejected',
  Removed: 'deleted',
}

/**
 * The same ten the public site offers. Kept here rather than imported because
 * the two apps do not share a module — if that list ever changes, it changes in
 * `client/src/data/copy.js` and here.
 */
const CATEGORIES = [
  'Films', 'Series', 'Music', 'Concerts', 'Comedy',
  'Documentaries', 'Sports', 'Podcasts', 'Courses', 'Behind the Scenes',
]

const ACCESS_LABEL = {
  ppv_forever: 'Pay Once',
  paid_premiere: 'Premiere',
  free_with_ads: 'Free + ads',
}

/**
 * The release strategy — see 036_release_model.sql. Creators choose between
 * the first two at upload (mapped automatically from their accessType
 * choice); only an admin can set `exclusive`, which is why it is the one
 * option a creator never sees anywhere in the studio.
 */
const RELEASE_LABEL = {
  permanent_paid: 'Permanent Paid',
  premiere_to_free: 'Premiere → Free',
  exclusive: 'Exclusive',
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
  const [previewing, setPreviewing] = useState(null)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const debounced = useDebounced(query, 300)

  const { data, loading, error, reload } = useApi(
    () => api.admin.videos({ q: debounced, status: STATUS_FILTERS[status], category, limit: 100 }),
    [debounced, status, category]
  )

  const rows = data?.videos || []
  const stats = [
    { icon: 'clapperboard', label: 'Videos', value: compact(rows.length) },
    { icon: 'eye', label: 'Total Views', value: compact(rows.reduce((n, v) => n + (v.views || 0), 0)) },
    { icon: 'ticket', label: 'Paid Unlocks', value: compact(rows.reduce((n, v) => n + (v.paidUnlocks || 0), 0)) },
    { icon: 'star', tone: 'gold', label: 'Featured', value: compact(rows.filter((v) => v.featured).length) },
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
            <FilterSelect
              value={category}
              onChange={setCategory}
              options={CATEGORIES}
              allLabel="All categories"
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
                      <VideoCell thumb={mediaUrl(v.thumbnailUrl)} title={v.title} meta={v.category} />
                    </td>
                    <td>{v.creatorName || v.creator?.name || '—'}</td>
                    <td>
                      <span className="pill free">{ACCESS_LABEL[v.accessType] || v.accessType}</span>
                      <select
                        className="release-model-select"
                        value={v.releaseModel || 'permanent_paid'}
                        onChange={(e) =>
                          act(
                            () => api.admin.updateVideo(v.id, { releaseModel: e.target.value }),
                            `Release model set to ${RELEASE_LABEL[e.target.value]}`
                          )
                        }
                        title="Release model — exclusive is admin-only"
                      >
                        {Object.entries(RELEASE_LABEL).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      {/* Exclusive has no accessType analogue of its own — this is
                          where an admin picks paid or free for it. "Unavailable"
                          is the existing Publish/Unpublish action in this same
                          row; a hidden video needs no third state to express it. */}
                      {v.releaseModel === 'exclusive' && (
                        <select
                          className="release-model-select"
                          value={v.accessType === 'free_with_ads' ? 'free_with_ads' : 'ppv_forever'}
                          onChange={(e) =>
                            act(
                              () => api.admin.updateVideo(v.id, { accessType: e.target.value }),
                              e.target.value === 'free_with_ads' ? 'Exclusive title set to free' : 'Exclusive title set to paid'
                            )
                          }
                          title="Exclusive: paid or free"
                        >
                          <option value="ppv_forever">Paid</option>
                          <option value="free_with_ads">Free</option>
                        </select>
                      )}
                    </td>
                    <td>{v.accessType === 'free_with_ads' ? 'Free' : tzs(v.priceTzs)}</td>
                    <td>{compact(v.views)}</td>
                    <td>{v.buyers ?? 0}</td>
                    <td>
                      {statusPill(v)}
                      {v.featured && !removed && (
                        <span className="pill gold" style={{ marginLeft: 6 }}>
                          Featured
                        </span>
                      )}
                      {v.isOriginal && !removed && (
                        <span className="pill gold" style={{ marginLeft: 6 }}>
                          Original
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="actions">
                        <IconButton
                          icon="play"
                          title="Watch this video"
                          onClick={() => setPreviewing(v)}
                        />
                        {/* Editorial control. Trending is measured and cannot be
                            steered; this is how something gets to the front of
                            the homepage on purpose — a new creator's first
                            release has no history to rank on. */}
                        {v.isPublished && !removed && (
                          <IconButton
                            icon={v.featured ? 'star-off' : 'star'}
                            title={v.featured ? 'Remove from featured' : 'Feature on the homepage'}
                            tone={v.featured ? undefined : 'good'}
                            onClick={() =>
                              act(
                                () => api.admin.updateVideo(v.id, { featured: !v.featured }),
                                v.featured ? 'No longer featured' : 'Featured on the homepage'
                              )
                            }
                          />
                        )}
                        {/* Admin-only editorial label — no effect on entitlement,
                            pricing or the paywall. Same category of flag as
                            Featured, just a different badge. */}
                        <IconButton
                          icon="badge-check"
                          title={v.isOriginal ? 'Remove "MTONYO+ Original"' : 'Mark as "MTONYO+ Original"'}
                          tone={v.isOriginal ? undefined : 'good'}
                          onClick={() =>
                            act(
                              () => api.admin.updateVideo(v.id, { isOriginal: !v.isOriginal }),
                              v.isOriginal ? 'No longer marked Original' : 'Marked as MTONYO+ Original'
                            )
                          }
                        />
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

      <VideoPreview
        video={previewing}
        open={Boolean(previewing)}
        onClose={() => setPreviewing(null)}
      />
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
