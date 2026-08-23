import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Rocket, Search, SlidersHorizontal, X } from 'lucide-react'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import VideoCard from '@/components/ui/VideoCard'
import { ErrorState, SkeletonCards } from '@/components/ui/States'
import useApi, { useDebounced } from '@/hooks/useApi'
import { toCard, videoLink } from '@/lib/videoView'
import { CATEGORIES } from '@/data/copy'
import useGoBack, { hasHistory } from '@/hooks/useGoBack'
import api from '@/lib/api'
import { useRole } from '@/context/AuthContext'

/**
 * Browse everything on the platform.
 *
 * Deliberately a searchable catalogue, not a ranked feed — discovery on
 * MTONYO+ happens through shared social links, and this is the "I'm already
 * here, show me what else there is" surface.
 *
 * Searching and filtering happen on the server, so the results are the whole
 * catalogue rather than whichever page happened to be loaded.
 */
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

export default function Explore() {
  const navigate = useNavigate()
  const { authed } = useRole()

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [access, setAccess] = useState('')
  const [sort, setSort] = useState('newest')

  const debounced = useDebounced(query, 300)

  const results = useApi(
    () => api.videos.list({ q: debounced, category, access, sort, limit: 48 }),
    [debounced, category, access, sort]
  )

  const videos = results.data?.videos || []
  const total = results.data?.total ?? 0
  const filtered = Boolean(query || category || access)

  /**
   * The ten canonical categories, in the same order as the homepage.
   *
   * This list used to be built from whatever strings existed in the database,
   * which is why Documentaries and Documentary both appeared, and why Food
   * showed up as an eleventh chip the client never asked for. Extras are not
   * appended: unknown values stay reachable under All, but they cannot mint
   * a new pill.
   */
  const categoryChips = useMemo(() => ['', ...CATEGORIES], [])

  const reset = () => {
    setQuery('')
    setCategory('')
    setAccess('')
  }

  /**
   * Actually go back.
   *
   * This used to push /dashboard, which is not the same thing: it threw away
   * whichever tab the person had come from and dropped them on the dashboard's
   * default. The button said Back and behaved like a link.
   *
   * The fallback only applies to somebody who arrived here directly — on a
   * shared link, or as their first page — where there is nothing of ours
   * behind them to return to.
   */
  const goBack = useGoBack(authed ? '/dashboard' : '/')
  const canGoBack = hasHistory()

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
                {results.loading ? 'Searching…' : `${total} ${total === 1 ? 'video' : 'videos'}`}
              </span>
              {filtered && (
                <button className="link-btn" onClick={reset}>
                  Clear filters
                </button>
              )}
            </div>

            {results.loading ? (
              <SkeletonCards count={8} />
            ) : results.error ? (
              <ErrorState error={results.error} onRetry={results.reload} />
            ) : videos.length ? (
              <div className="vid-grid">
                {videos.map((v) => (
                  <VideoCard key={v.id} video={toCard(v)} onClick={() => navigate(videoLink(v))} />
                ))}
              </div>
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
