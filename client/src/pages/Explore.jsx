import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, Rocket, Search, SlidersHorizontal, X } from 'lucide-react'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import VideoCard from '@/components/ui/VideoCard'
import BusyButton from '@/components/ui/BusyButton'
import { ErrorState, SkeletonCards } from '@/components/ui/States'
import { useDebounced } from '@/hooks/useApi'
import { useProgressBar } from '@/context/ProgressContext'
import { toCard, videoLink } from '@/lib/videoView'
import { CATEGORIES } from '@/data/copy'
import useGoBack, { hasHistory } from '@/hooks/useGoBack'
import api from '@/lib/api'
import { useRole } from '@/context/AuthContext'
import { explorePageSize } from '@/lib/mobileUx'

const ACCESS_FILTERS = [
  { label: 'All Access', value: '' },
  { label: 'Pay Once', value: 'ppv_forever' },
  { label: 'Paid Premiere', value: 'paid_premiere' },
  { label: 'Free + Ads', value: 'free_with_ads' },
]

const SORTS = [
  { label: 'Newest', value: 'newest' },
  { label: 'Most watched', value: 'popular' },
  { label: 'Cheapest', value: 'price_low' },
]

const PAGE_SIZE = explorePageSize()

export default function Explore() {
  const navigate = useNavigate()
  const { authed } = useRole()

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [access, setAccess] = useState('')
  const [sort, setSort] = useState('newest')
  const [videos, setVideos] = useState([])
  const [total, setTotal] = useState(0)
  const [nextOffset, setNextOffset] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [isRefetching, setIsRefetching] = useState(false)
  const [error, setError] = useState(null)
  const videosRef = useRef(videos)
  videosRef.current = videos

  const debounced = useDebounced(query, 300)
  const filtered = Boolean(query || category || access)
  const categoryChips = ['', ...CATEGORIES]

  useProgressBar(isRefetching)

  const fetchPage = useCallback(
    async (offset, { append = false, quiet = false } = {}) => {
      if (append) {
        setLoadingMore(true)
      } else if (videosRef.current.length) {
        setIsRefetching(true)
      } else if (!quiet) {
        setLoading(true)
      }
      setError(null)
      try {
        const res = await api.videos.list({
          q: debounced || undefined,
          category: category || undefined,
          access: access || undefined,
          sort,
          limit: PAGE_SIZE,
          offset,
        })
        const rows = res?.videos || []
        setVideos((prev) => (append ? [...prev, ...rows] : rows))
        setTotal(res?.total ?? 0)
        setNextOffset(res?.nextOffset ?? null)
      } catch (err) {
        setError(err?.message || 'No connection — tap to retry')
      } finally {
        setLoading(false)
        setLoadingMore(false)
        setIsRefetching(false)
      }
    },
    [debounced, category, access, sort]
  )

  useEffect(() => {
    fetchPage(0, { append: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, category, access, sort])

  const loadMore = useCallback(() => {
    if (loadingMore || nextOffset == null) return
    fetchPage(nextOffset, { append: true })
  }, [loadingMore, nextOffset, fetchPage])

  const sentinelRef = useRef(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || nextOffset == null) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore()
      },
      { rootMargin: '200px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [nextOffset, loadMore])

  const reset = () => {
    setQuery('')
    setCategory('')
    setAccess('')
  }

  const goBack = useGoBack(authed ? '/dashboard' : '/')
  const canGoBack = hasHistory()

  const openVideo = (v) => {
    navigate(videoLink(v), { state: { preview: toCard(v) } })
  }

  return (
    <div className="page">
      <Header />

      <section className="explore">
        <div className="container explore-stack">
          <header className="explore-hero">
            <button className="explore-back" type="button" onClick={goBack} aria-label="Go back">
              <ArrowLeft />
              <span className="explore-back-label">
                {canGoBack ? 'Back' : authed ? 'Back to dashboard' : 'Back to home'}
              </span>
            </button>

            <div className="explore-head">
              <h1>
                Explore <span className="brand-accent">MTONYO+</span>
              </h1>
              <p>
                Every Paid Premiere, Pay Once release and Free + Ads show on the platform. Watch
                the free preview, pay your way, and it stays in your library.
              </p>
            </div>
          </header>

          <div className="explore-panel">
            <div className="explore-search">
              <Search />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search videos, creators or categories…"
                aria-label="Search the catalogue"
              />
              {query && (
                <button className="es-clear" onClick={() => setQuery('')} aria-label="Clear search">
                  <X />
                </button>
              )}
            </div>

            {categoryChips.length > 1 && (
              <div className="explore-filters explore-cats" role="group" aria-label="Category">
                {categoryChips.map((c) => (
                  <button
                    key={c || 'all'}
                    className={`chip ${category === c ? 'on' : ''}`.trim()}
                    onClick={() => setCategory(c)}
                    aria-pressed={category === c}
                  >
                    {c || 'All'}
                  </button>
                ))}
              </div>
            )}

            <div className="explore-filter-groups">
              <div className="explore-filters explore-filter-row" role="group" aria-label="Access type">
                <span className="ef-label">
                  <SlidersHorizontal />
                  Access
                </span>
                <div className="explore-filter-chips">
                  {ACCESS_FILTERS.map((a) => (
                    <button
                      key={a.label}
                      className={`chip chip-sm ${access === a.value ? 'on' : ''}`.trim()}
                      onClick={() => setAccess(a.value)}
                      aria-pressed={access === a.value}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="explore-filters explore-filter-row" role="group" aria-label="Sort order">
                <span className="ef-label">Sort</span>
                <div className="explore-filter-chips">
                  {SORTS.map((s) => (
                    <button
                      key={s.value}
                      className={`chip chip-sm ${sort === s.value ? 'on' : ''}`.trim()}
                      onClick={() => setSort(s.value)}
                      aria-pressed={sort === s.value}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="explore-results">
            <div className="explore-count">
              <span>
                {loading && !videos.length
                  ? 'Loading videos…'
                  : `${total} ${total === 1 ? 'video' : 'videos'}`}
              </span>
              {isRefetching && <span className="explore-updating-pill">Updating…</span>}
              {filtered && (
                <button className="link-btn" onClick={reset}>
                  Clear filters
                </button>
              )}
            </div>

            {loading && !videos.length ? (
              <SkeletonCards count={PAGE_SIZE > 12 ? 8 : 6} label="Loading videos…" />
            ) : error && !videos.length ? (
              <ErrorState error={error} onRetry={() => fetchPage(0)} />
            ) : videos.length ? (
              <>
                <div className="vid-grid">
                  {videos.map((v, i) => (
                    <VideoCard
                      key={v.id}
                      video={toCard(v)}
                      eager={i < 4}
                      onClick={() => openVideo(v)}
                    />
                  ))}
                </div>
                {nextOffset != null && (
                  <div className="explore-more" ref={sentinelRef}>
                    <BusyButton
                      className="btn btn-ghost"
                      busy={loadingMore}
                      onClick={loadMore}
                    >
                      {loadingMore ? 'Loading more…' : 'Load more videos'}
                    </BusyButton>
                  </div>
                )}
                {loadingMore && (
                  <p className="explore-loading-more" aria-live="polite">
                    <Loader2 size={16} className="ui-spin" /> Loading more…
                  </p>
                )}
              </>
            ) : (
              <div className="explore-empty">
                <Search />
                <b>{filtered ? 'Nothing matches that yet' : 'No videos published yet'}</b>
                <p>
                  {filtered
                    ? 'Try a different search, or clear the filters to see everything.'
                    : 'Videos appear here as soon as creators upload them and the team approves them.'}
                </p>
                {filtered ? (
                  <button className="btn btn-ghost" onClick={reset}>
                    Clear filters
                  </button>
                ) : (
                  <button className="btn btn-gold" onClick={() => navigate('/signup')}>
                    <Rocket />
                    Be the first creator
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
