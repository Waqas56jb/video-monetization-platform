import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Search, SlidersHorizontal, X } from 'lucide-react'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import VideoCard from '@/components/ui/VideoCard'
import { ACCESS_FILTERS, CATALOG, CATEGORIES } from '@/data/content'
import { useRole } from '@/context/AuthContext'

/**
 * Browse everything on the platform.
 *
 * Deliberately a searchable catalogue, not a ranked feed — discovery on
 * MTONYO+ happens through shared social links, and this is the "I'm already
 * signed in, show me what else is here" surface.
 */
export default function Explore() {
  const navigate = useNavigate()
  const { authed } = useRole()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [access, setAccess] = useState('All Access')

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    return CATALOG.filter((v) => {
      const matchesQuery =
        !q || `${v.title} ${v.author} ${v.category}`.toLowerCase().includes(q)
      const matchesCategory = category === 'All' || v.category === category
      const matchesAccess = access === 'All Access' || v.access === access
      return matchesQuery && matchesCategory && matchesAccess
    })
  }, [query, category, access])

  const filtered = query || category !== 'All' || access !== 'All Access'

  /** Signed-in users belong back in the dashboard; visitors go to the site. */
  const goBack = () => navigate(authed ? '/dashboard' : '/')

  const reset = () => {
    setQuery('')
    setCategory('All')
    setAccess('All Access')
  }

  return (
    <div className="page">
      <Header />

      <section className="explore">
        <div className="container">
          {/* Reached from the creator/viewer menu as well as the public site,
              so it always offers the matching way back. */}
          <button className="explore-back" onClick={goBack}>
            <ArrowLeft />
            {authed ? 'Back to dashboard' : 'Back to home'}
          </button>

          <div className="explore-head">
            <h1>
              Explore <span className="brand-accent">MTONYO+</span>
            </h1>
            <p>
              Every premiere, pay-per-view drop and free-with-ads show on the platform. Watch the
              free preview, pay with mobile money, keep it forever.
            </p>
          </div>

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

          <div className="explore-filters" role="group" aria-label="Category">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                className={`chip ${category === c ? 'on' : ''}`.trim()}
                onClick={() => setCategory(c)}
                aria-pressed={category === c}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="explore-filters second" role="group" aria-label="Access type">
            <span className="ef-label">
              <SlidersHorizontal />
              Access
            </span>
            {ACCESS_FILTERS.map((a) => (
              <button
                key={a}
                className={`chip chip-sm ${access === a ? 'on' : ''}`.trim()}
                onClick={() => setAccess(a)}
                aria-pressed={access === a}
              >
                {a}
              </button>
            ))}
          </div>

          <div className="explore-count">
            {results.length} {results.length === 1 ? 'video' : 'videos'}
            {filtered && (
              <button className="link-btn" onClick={reset}>
                Clear filters
              </button>
            )}
          </div>

          {results.length > 0 ? (
            <div className="vid-grid">
              {results.map((v) => (
                <VideoCard key={v.id} video={v} onClick={() => navigate(`/watch/${v.id}`)} />
              ))}
            </div>
          ) : (
            <div className="explore-empty">
              <Search />
              <b>Nothing matches that yet</b>
              <p>Try a different search, or clear the filters to see everything.</p>
              <button className="btn btn-ghost" onClick={reset}>
                Clear filters
              </button>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  )
}
