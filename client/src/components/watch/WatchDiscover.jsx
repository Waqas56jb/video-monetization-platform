import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import VideoGrid from '@/components/ui/VideoGrid'
import { ErrorState, SkeletonCards } from '@/components/ui/States'
import { compact } from '@/hooks/useApi'
import api, { mediaUrl } from '@/lib/api'

const PER_SECTION = 6

/**
 * Pure: split what the catalogue returned into the sections under a video.
 *
 * Every video appears at most once on the page, and never the one being
 * watched; a section with nothing new to show is left out rather than
 * repeating cards from the one above it. As the catalogue grows each section
 * fills on its own.
 */
export function planDiscover({ current, related = [], trending = [], popular = [] }) {
  const shown = new Set([current?.id])
  const creatorId = current?.creator?.id
  const take = (list, keep = () => true, max = PER_SECTION) => {
    const out = []
    for (const v of list) {
      if (out.length >= max) break
      if (!v?.id || shown.has(v.id) || !keep(v)) continue
      shown.add(v.id)
      out.push(v)
    }
    return out
  }
  const all = [...related, ...trending, ...popular]
  const fromCreator = take(all, (v) => creatorId && v.creator?.id === creatorId)
  const category = current?.category
  const alsoLike = take(related, (v) => Boolean(category) && v.category === category)
  // A small catalogue still reads as sections: one row of trending, the rest
  // under most watched. A big one gets two full rows of each.
  const pool = new Set(all.map((v) => v?.id)).size
  const trendingNow = take(trending, undefined, pool > 2 * PER_SECTION ? PER_SECTION : 3)
  const mostWatched = take([...popular, ...related])

  // Other creators, busiest first, from every video we were sent.
  const byCreator = new Map()
  for (const v of all) {
    const c = v?.creator
    if (!c?.id || c.id === creatorId) continue
    const row = byCreator.get(c.id) || { ...c, ids: new Set(), views: 0 }
    if (!row.ids.has(v.id)) {
      row.ids.add(v.id)
      row.views += Number(v.views) || 0
    }
    byCreator.set(c.id, row)
  }
  const creators = [...byCreator.values()]
    .map(({ ids, ...c }) => ({ ...c, videoCount: ids.size }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 6)

  return { fromCreator, alsoLike, trendingNow, mostWatched, creators }
}

function Shelf({ id, title, sub, videos }) {
  if (!videos.length) return null
  return (
    <section className="discover-sec" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {sub && <p className="discover-sub">{sub}</p>}
      <VideoGrid videos={videos} className="discover-grid" />
    </section>
  )
}

const initials = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'C'

/**
 * Everything under the video: more from this creator, you may also like,
 * trending, most watched, and other creators — so a viewer who reaches the end
 * of one video always has somewhere to go next (client, 2026-11-22).
 */
export default function WatchDiscover({ video }) {
  const key = video?.slug || video?.id
  const [state, setState] = useState({ loading: true, error: null, data: null })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!key) return undefined
    let live = true
    setState((s) => ({ ...s, loading: true, error: null }))
    Promise.allSettled([
      api.videos.related(key),
      api.videos.list({ sort: 'trending', limit: 24 }),
      api.videos.list({ sort: 'popular', limit: 24 }),
    ]).then(([rel, tr, pop]) => {
      if (!live) return
      const list = (r) => (r.status === 'fulfilled' ? r.value?.videos || [] : [])
      if ([rel, tr, pop].every((r) => r.status === 'rejected')) {
        setState({ loading: false, error: rel.reason, data: null })
        return
      }
      setState({ loading: false, error: null, data: { related: list(rel), trending: list(tr), popular: list(pop) } })
    })
    return () => {
      live = false
    }
  }, [key, attempt])

  const plan = useMemo(
    () => (state.data ? planDiscover({ current: video, ...state.data }) : null),
    [state.data, video]
  )

  if (!key) return null
  if (state.loading && !plan) {
    return (
      <div className="discover" aria-busy="true">
        <section className="discover-sec">
          <h2>You may also like</h2>
          <SkeletonCards count={3} />
        </section>
      </div>
    )
  }
  if (state.error && !plan) {
    return (
      <div className="discover">
        <ErrorState error={state.error} onRetry={() => setAttempt((n) => n + 1)} title="Could not load more videos" />
      </div>
    )
  }

  const creatorName = video?.creator?.name
  return (
    <div className="discover">
      <Shelf id="disc-creator" title={creatorName ? `More from ${creatorName}` : 'More from this creator'} videos={plan.fromCreator} />
      <Shelf id="disc-like" title="You may also like" sub={video?.category ? `More in ${video.category}.` : undefined} videos={plan.alsoLike} />
      <Shelf id="disc-trending" title="Trending now" sub="What viewers are watching this week." videos={plan.trendingNow} />
      <Shelf id="disc-popular" title="Most watched" videos={plan.mostWatched} />
      {plan.creators.length > 0 && (
        <section className="discover-sec" aria-labelledby="disc-creators">
          <h2 id="disc-creators">Discover more creators</h2>
          <div className="discover-creators">
            {plan.creators.map((c) => (
              <div className="discover-creator" key={c.id}>
                {c.avatarUrl ? <img src={mediaUrl(c.avatarUrl)} alt="" /> : <span className="creator-initials">{initials(c.name)}</span>}
                <div>
                  <Link to={`/creator/${c.id}`}>
                    <b>{c.name}</b>
                  </Link>
                  <small>
                    {c.videoCount} {c.videoCount === 1 ? 'video' : 'videos'} · {compact(c.views)} views
                  </small>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      <div className="discover-end">
        <Link className="btn btn-ghost" to="/explore">
          <Compass size={16} />
          Browse all videos
        </Link>
      </div>
    </div>
  )
}
