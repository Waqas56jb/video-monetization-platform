import { useMemo, useState } from 'react'
import Panel from '@/components/ui/Panel'
import { StatGrid } from '@/components/ui/StatCard'
import { EmptyRow, IconButton, TableWrap, VideoCell, rowClass } from '@/components/ui/Table'
import { FilterRow, FilterSelect, SearchBar } from '@/components/ui/Filters'
import { useAdminData } from '@/context/AdminDataContext'
import { useConfirm } from '@/context/ConfirmContext'
import { useToast } from '@/context/ToastContext'
import { CONFIRM, TOASTS, VIDEO_STATS } from '@/data/adminData'

export default function VideosTab() {
  const { videos } = useAdminData()
  const confirm = useConfirm()
  const showToast = useToast()
  const [query, setQuery] = useState('')
  const [type, setType] = useState('')

  const rows = useMemo(() => {
    const q = query.toLowerCase()
    const t = type.toLowerCase()
    return videos.items.filter((v) => {
      const haystack = [v.title, v.meta, v.creator, v.status, v.price, v.views, v.revenue]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q) && (!t || v.status.toLowerCase().includes(t))
    })
  }, [videos.items, query, type])

  const clearFlags = (video) => {
    videos.remove(video.id)
    showToast(TOASTS.flagsCleared)
  }

  const unpublish = (video) =>
    confirm({
      ...CONFIRM.unpublishVideo,
      onConfirm: () => {
        videos.patch(video.id, { status: 'Unpublished', pill: 'bad' })
        showToast(TOASTS.unpublished)
      },
    })

  const remove = (video) =>
    confirm({
      ...CONFIRM.deleteVideo,
      onConfirm: () => {
        videos.remove(video.id)
        showToast(TOASTS.deleted)
      },
    })

  return (
    <div className="tab">
      <StatGrid stats={VIDEO_STATS} />

      <Panel
        title="All Videos"
        action={
          <FilterRow>
            <SearchBar value={query} onChange={setQuery} placeholder="Search videos…" />
            <FilterSelect
              value={type}
              onChange={setType}
              options={['PPV', 'Premiere', 'Free', 'Unpublished']}
              allLabel="All Types"
            />
          </FilterRow>
        }
      >
        <TableWrap>
          <thead>
            <tr>
              <th>Video</th>
              <th>Creator</th>
              <th>Type</th>
              <th>Price</th>
              <th>Views</th>
              <th>Revenue</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={7}>No videos match this search.</EmptyRow>}
            {rows.map((v) => {
              const unpublished = v.status === 'Unpublished'
              return (
                <tr key={v.id} className={rowClass(v, unpublished)}>
                  <td>
                    <VideoCell thumb={v.thumb} title={v.title} meta={v.meta} />
                  </td>
                  <td>{v.creator}</td>
                  <td>
                    <span className={`pill ${v.pill}`}>{v.status}</span>
                  </td>
                  <td>{v.price}</td>
                  <td>{v.views}</td>
                  <td className="money">
                    {v.revenue}
                    {v.revenueNote && (
                      <span style={{ color: 'var(--muted2)', fontSize: 11 }}> {v.revenueNote}</span>
                    )}
                  </td>
                  <td>
                    <div className="actions">
                      <IconButton
                        icon="play"
                        title="Preview"
                        onClick={() => showToast(TOASTS.videoPreview)}
                      />
                      {v.flagged ? (
                        <IconButton
                          icon="shield-check"
                          title="Clear flags"
                          tone="good"
                          onClick={() => clearFlags(v)}
                        />
                      ) : (
                        <IconButton
                          icon="repeat"
                          title="Force status change"
                          onClick={() => showToast(TOASTS.statusEditor)}
                        />
                      )}
                      <IconButton
                        icon="eye-off"
                        title="Unpublish"
                        tone="danger"
                        onClick={() => unpublish(v)}
                      />
                      <IconButton
                        icon="trash-2"
                        title="Remove permanently"
                        tone="danger"
                        onClick={() => remove(v)}
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
