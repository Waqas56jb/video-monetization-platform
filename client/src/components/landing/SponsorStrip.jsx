import { useEffect, useRef, useState } from 'react'
import useApi from '@/hooks/useApi'
import api from '@/lib/api'

/**
 * Homepage sponsor banners, set by the Super Admin (Milestone 3).
 *
 * Renders nothing at all while loading, when there are no live sponsors, or if
 * the request fails — an advert must never be the reason the homepage looks
 * broken. Several sponsors rotate every 7 s (paused on hover/focus, and not at
 * all for viewers who ask for reduced motion).
 *
 * A view is counted once per sponsor per browser session, and only when at
 * least half the banner was actually on screen. A click goes through the API
 * (counted there), which forwards to the sponsor's address.
 */
const ROTATE_MS = 7000
const SEEN_KEY = 'mtonyo.sponsorsSeen'

function seenThisSession() {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) || '[]'))
  } catch {
    return new Set()
  }
}
function markSeen(set) {
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...set]))
  } catch {
    /* not counted twice in this tab anyway */
  }
}

export default function SponsorStrip() {
  const { data } = useApi(() => api.sponsors.live(), [])
  const sponsors = data?.sponsors || []
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const box = useRef(null)
  const current = sponsors[index % (sponsors.length || 1)]

  useEffect(() => {
    if (sponsors.length < 2 || paused) return
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => setIndex((i) => (i + 1) % sponsors.length), ROTATE_MS)
    return () => clearInterval(t)
  }, [sponsors.length, paused])

  useEffect(() => {
    if (!current || !box.current || typeof IntersectionObserver === 'undefined') return
    const seen = seenThisSession()
    if (seen.has(current.id)) return
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        seen.add(current.id)
        markSeen(seen)
        api.sponsors.impression(current.id).catch(() => {})
        io.disconnect()
      },
      { threshold: 0.5 }
    )
    io.observe(box.current)
    return () => io.disconnect()
  }, [current?.id])

  if (!current) return null

  return (
    <section className="sponsor-strip" aria-label="Sponsored" ref={box}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <div className="container">
        <a className={`sponsor-card${current.imageUrl ? ' has-image' : ''}`} href={api.sponsors.clickUrl(current)}
          target="_blank" rel="sponsored noopener noreferrer" key={current.id}>
          {current.imageUrl && <img src={current.imageUrl} alt="" loading="lazy" decoding="async" width="1200" height="400" />}
          <span className="sponsor-copy">
            <small className="sponsor-label">Sponsored · {current.sponsor}</small>
            <strong>{current.title}</strong>
            {current.tagline && <span className="sponsor-tagline">{current.tagline}</span>}
          </span>
          <span className="btn btn-gold btn-sm sponsor-cta">{current.cta}</span>
        </a>
        {sponsors.length > 1 && (
          <div className="sponsor-dots" role="tablist" aria-label="Sponsors">
            {sponsors.map((s, i) => (
              <button key={s.id} type="button" role="tab" aria-selected={i === index % sponsors.length}
                aria-label={`Sponsor ${i + 1}: ${s.sponsor}`} onClick={() => setIndex(i)} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
