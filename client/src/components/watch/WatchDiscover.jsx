import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import VideoGrid from '@/components/ui/VideoGrid'
import { DiscoverCard } from '@/components/ui/Brand'
import { ErrorState, SkeletonCards } from '@/components/ui/States'
import { compact } from '@/hooks/useApi'
import { toCard, videoLink } from '@/lib/videoView'
import api, { mediaUrl } from '@/lib/api'

const PER_SECTION = 6
const RAIL = 5

/**
 * Pure: split what the catalogue returned into the side rail and the
 * sections under a video.
 *
 * The rail is "up next": this creator and this category first. The sections
 * below never repeat a video among themselves, and leave out what the rail
 * already shows once the catalogue is big enough to afford it — with seven
 * videos on the whole platform, hiding the rail's five would empty the page.
 * A section with nothing to show is left out; each fills as the catalogue grows.
 */
export function planDiscover({ current, related = [], trending = [], popular = [] }) {
  const creatorId = current?.creator?.id
  const category = current?.category
  const all = [...related, ...trending, ...popular]
  const pool = new Set(all.map((v) => v?.id).filter(Boolean))
  pool.delete(current?.id)
  const big = pool.size > 2 * PER_SECTION

  const pick = (shown) => (list, keep = () => true, max = PER_SECTION) => {
    const out = []
    for (const v of list) {
      if (out.length >= max) break
      if (!v?.id || shown.has(v.id) || !keep(v)) continue
      shown.add(v.id)
      out.push(v)
    }
    return out
  }

  const railShown = new Set([current?.id])
  const railTake = pick(railShown)
  const rail = [
    ...railTake(related, (v) => creatorId && v.creator?.id === creatorId, RAIL),
    ...railTake(related, (v) => category && v.category === category, RAIL),
    ...railTake(related, undefined, RAIL),
    ...railTake(trending, undefined, RAIL),
  ].slice(0, RAIL)

  const shown = new Set([current?.id, ...(big ? rail.map((v) => v.id) : [])])
  const take = pick(shown)
  const fromCreator = take(all, (v) => creatorId && v.creator?.id === creatorId)
  const alsoLike = take(related, (v) => Boolean(category) && v.category === category)
  // A small catalogue still reads as sections: one row of trending, the rest
  // under most watched. A big one gets two full rows of each.
  const trendingNow = take(trending, undefined, big ? PER_SECTION : 3)
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

  return { rail, fromCreator, alsoLike, trendingNow, mostWatched, creators }
}

/* The rail and the sections below are two components fed by one set of
   requests: the first to ask starts them, the second gets the same promise. */
const cache = new Map()
function loadDiscover(key) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < 60_000) return hit.promise
  const promise = Promise.allSettled([
    api.videos.related(key),
    api.videos.list({ sort: 'trending', limit: 24 }),
    api.videos.list({ sort: 'popular', limit: 24 }),
  ]).then(([rel, tr, pop]) => {
    const list = (r) => (r.status === 'fulfilled' ? r.value?.videos || [] : [])
    if ([rel, tr, pop].every((r) => r.status === 'rejected')) {
      cache.delete(key)
      throw rel.reason
    }
    return { related: list(rel), trending: list(tr), popular: list(pop) }
  })
  cache.set(key, { at: Date.now(), promise })
  return promise
}

function useDiscover(video) {
  const key = video?.slug || video?.id
  const [state, setState] = useState({ loading: true, error: null, data: null })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!key) return undefined
    let live = true
    setState((s) => ({ ...s, loading: true, error: null }))
    loadDiscover(key).then(
      (data) => live && setState({ loading: false, error: null, data }),
      (error) => live && setState({ loading: false, error, data: null })
    )
    return () => {
      live = false
    }
  }, [key, attempt])
  const plan = useMemo(() => (state.data ? planDiscover({ current: video, ...state.data }) : null), [state.data, video])
  return { key, plan, loading: state.loading, error: state.error, retry: () => setAttempt((n) => n + 1) }
}

const initials = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'C'

const price = (v) =>
  v.accessType === 'free_with_ads' || !Number(v.priceTzs) ? 'Free' : `TZS ${Number(v.priceTzs).toLocaleString('en-US')}`

const duration = (s) => {
  const n = Math.round(Number(s) || 0)
  if (!n) return ''
  const h = Math.floor(n / 3600), m = Math.floor((n % 3600) / 60), sec = String(n % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

/**
 * "Up next" beside the player on desktop and tablet; under the video on a
 * phone (client, 2026-11-23: use the wasted space either side of the player
 * for discovery, without looking like YouTube).
 */
export function WatchRail({ video }) {
  const { plan, loading } = useDiscover(video)
  if (loading && !plan) {
    return (
      <aside className="watch-rail" aria-busy="true">
        <h2>Up next</h2>
        {[0, 1, 2].map((i) => (
          <div className="rail-item is-skeleton" key={i} />
        ))}
      </aside>
    )
  }
  if (!plan?.rail.length) return null
  return (
    <aside className="watch-rail" aria-labelledby="rail-title">
      <h2 id="rail-title">Up next</h2>
      {plan.rail.map((v) => {
        const card = toCard(v)
        return (
          <Link className="rail-item" key={v.id} to={videoLink(v)} state={{ preview: card }}>
            <span className="rail-thumb">
              {v.thumbnailUrl ? <img src={mediaUrl(v.thumbnailUrl)} alt="" loading="lazy" decoding="async" /> : null}
              {duration(v.durationSeconds) && <span className="rail-time">{duration(v.durationSeconds)}</span>}
            </span>
            <span className="rail-copy">
              <b>{v.title}</b>
              <small>{v.creator?.name}</small>
              <span className={`rail-price ${price(v) === 'Free' ? 'is-free' : ''}`}>{price(v)}</span>
            </span>
          </Link>
        )
      })}
      <Link className="rail-more" to="/explore">
        <Compass size={15} /> Browse all videos
      </Link>
    </aside>
  )
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

/**
 * Everything under the video: more from this creator, you may also like,
 * trending, most watched, other creators and the Discover card — so a viewer
 * who reaches the end of one video always has somewhere to go next
 * (client, 2026-11-22/23).
 */
export default function WatchDiscover({ video }) {
  const { key, plan, loading, error, retry } = useDiscover(video)

  if (!key) return null
  if (loading && !plan) {
    return (
      <div className="discover" aria-busy="true">
        <section className="discover-sec">
          <h2>You may also like</h2>
          <SkeletonCards count={3} />
        </section>
      </div>
    )
  }
  if (error && !plan) {
    return (
      <div className="discover">
        <ErrorState error={error} onRetry={retry} title="Could not load more videos" />
        <DiscoverCard />
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
      <DiscoverCard />
    </div>
  )
}
