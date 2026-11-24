import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, RefreshCw, X } from 'lucide-react'
import api from '@/lib/api'
import { compact } from '@/hooks/useApi'
import useLockBodyScroll from '@/hooks/useLockBodyScroll'

/**
 * VIEW STATS for one homepage banner: totals, then views and clicks per day
 * for the last 30 days. Two charts, not one with two scales: views run in the
 * hundreds and clicks in single figures, so a shared axis would flatten one of
 * them. Each bar shows its exact number on hover/focus; the table under the
 * charts has every figure.
 */
const dayLabel = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export function DailyBars({ title, days, field, tone }) {
  const max = Math.max(1, ...days.map((d) => d[field]))
  const total = days.reduce((n, d) => n + d[field], 0)
  const [hover, setHover] = useState(null)
  const shown = hover != null ? days[hover] : null
  return (
    <figure className="spst-chart">
      <figcaption>
        <b>{title}</b>
        <span>{shown ? `${dayLabel(shown.day)}: ${compact(shown[field])}` : `${compact(total)} in 30 days`}</span>
      </figcaption>
      <div className="spst-plot" role="img" aria-label={`${title} per day, last 30 days, ${total} in total`} onMouseLeave={() => setHover(null)}>
        {days.map((d, i) => (
          <button
            type="button"
            key={d.day}
            className="spst-bar"
            aria-label={`${dayLabel(d.day)}: ${d[field]} ${title.toLowerCase()}`}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
          >
            <span className={`spst-fill ${tone}`} style={{ height: d[field] ? `${Math.max(4, (d[field] / max) * 100)}%` : 0 }} />
          </button>
        ))}
      </div>
      <div className="spst-axis">
        <span>{days[0] ? dayLabel(days[0].day) : ''}</span>
        <span>{days.length ? dayLabel(days[days.length - 1].day) : ''}</span>
      </div>
    </figure>
  )
}

export default function SponsorStats({ sponsor, onClose }) {
  const [state, setState] = useState({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useLockBodyScroll(Boolean(sponsor))

  useEffect(() => {
    if (!sponsor?.id) return undefined
    let alive = true
    setState({ status: 'loading' })
    api.admin
      .sponsorStats(sponsor.id)
      .then((res) => alive && setState({ status: 'ready', ...res }))
      .catch((err) => alive && setState({ status: 'error', note: err.message }))
    return () => {
      alive = false
    }
  }, [sponsor?.id, attempt])

  useEffect(() => {
    if (!sponsor) return undefined
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sponsor, onClose])

  if (!sponsor) return null
  const s = state.sponsor || sponsor
  const days = state.days || []

  const body = (
    <div className="video-preview-overlay adpv-overlay" role="dialog" aria-modal="true" aria-label={`Stats for ${sponsor.sponsor}`}>
      <div className="video-preview-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="video-preview-dialog">
        <button className="modal-x" onClick={onClose} aria-label="Close stats">
          <X />
        </button>
        <div className="preview-head">
          <b>Stats · {s.sponsor}</b>
          <small>{s.title}</small>
        </div>

        <div className="spst-totals">
          <div>
            <small>Views</small>
            <b>{compact(s.impressions)}</b>
          </div>
          <div>
            <small>Clicks</small>
            <b>{compact(s.clicks)}</b>
          </div>
          <div>
            <small>Click-through rate</small>
            <b>{s.ctr ?? 0}%</b>
          </div>
        </div>

        {state.status === 'loading' && <div className="sk" style={{ height: 180, borderRadius: 12 }} />}
        {state.status === 'error' && (
          <div className="state-block">
            <AlertTriangle size={24} />
            <b>Could not load the stats</b>
            <p>{state.note}</p>
            <button className="btn btn-ghost" type="button" onClick={() => setAttempt((n) => n + 1)}>
              <RefreshCw size={14} /> Try again
            </button>
          </div>
        )}
        {state.status === 'ready' && (
          <>
            <DailyBars title="Views" days={days} field="impressions" tone="is-views" />
            <DailyBars title="Clicks" days={days} field="clicks" tone="is-clicks" />
            <details className="spst-table">
              <summary>Every day as a table</summary>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>Views</th>
                    <th>Clicks</th>
                    <th>CTR</th>
                  </tr>
                </thead>
                <tbody>
                  {[...days].reverse().map((d) => (
                    <tr key={d.day}>
                      <td>{dayLabel(d.day)}</td>
                      <td>{d.impressions}</td>
                      <td>{d.clicks}</td>
                      <td>{d.impressions ? `${Math.round((d.clicks / d.impressions) * 1000) / 10}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
            <p className="field-note">A view is counted once per visitor session when at least half the banner is on screen. Days are Tanzania time. Daily figures start from 24 Nov 2026; the totals above include everything before.</p>
          </>
        )}
      </div>
    </div>
  )
  return typeof document !== 'undefined' ? createPortal(body, document.body) : body
}
