import { useMemo } from 'react'

/**
 * What this creator actually earned, day by day.
 *
 * This used to be a hand-drawn curve that rose encouragingly no matter what —
 * a picture of a business rather than a picture of yours. It now plots the
 * earnings rows and scales to them, and says so plainly when there is not yet
 * enough to draw.
 *
 * `series`: [{ day, amountTzs }]
 */
const W = 600
const H = 240
const TOP = 20
const BOTTOM = 46

export default function RevenueChart({ series = [] }) {
  const chart = useMemo(() => {
    const points = series
      .map((p) => ({ t: p.day || p.date, v: Number(p.amountTzs ?? p.amount ?? 0) }))
      .filter((p) => p.t)

    if (points.length < 2) return null

    const max = Math.max(...points.map((p) => p.v), 1)
    const stepX = W / (points.length - 1)
    const y = (v) => H - BOTTOM - (v / max) * (H - TOP - BOTTOM)

    const coords = points.map((p, i) => ({ x: i * stepX, y: y(p.v), ...p }))

    const line = coords
      .map((c, i) => {
        if (i === 0) return `M${c.x.toFixed(1)},${c.y.toFixed(1)}`
        const prev = coords[i - 1]
        const mid = (prev.x + c.x) / 2
        return `C${mid.toFixed(1)},${prev.y.toFixed(1)} ${mid.toFixed(1)},${c.y.toFixed(1)} ${c.x.toFixed(1)},${c.y.toFixed(1)}`
      })
      .join(' ')

    const every = Math.max(1, Math.ceil(coords.length / 5))
    return {
      coords,
      line,
      area: `${line} L${W},${H - BOTTOM} L0,${H - BOTTOM} Z`,
      labels: coords.filter((_, i) => i % every === 0 || i === coords.length - 1),
      max,
      last: coords[coords.length - 1],
      total: points.reduce((n, p) => n + p.v, 0),
    }
  }, [series])

  if (!chart) {
    return (
      <div className="chart-wrap" style={{ display: 'grid', placeItems: 'center', minHeight: 150 }}>
        <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', margin: 0 }}>
          Not enough activity to plot yet — this fills in as sales come through.
        </p>
      </div>
    )
  }

  const money = (v) =>
    v >= 1_000_000 ? (v / 1_000_000).toFixed(1) + 'M' : v >= 1_000 ? Math.round(v / 1_000) + 'K' : String(v)

  const tick = (iso) => {
    const d = new Date(iso)
    return Number.isNaN(d.getTime())
      ? String(iso).slice(0, 6)
      : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  return (
    <div className="chart-wrap">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Your earnings, TZS ${chart.total.toLocaleString()} over ${chart.coords.length} days`}
      >
        <defs>
          <linearGradient id="areaG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7c3aed" stopOpacity=".45" />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="lineG" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>
        </defs>

        <g stroke="rgba(255,255,255,.05)">
          <line x1="0" y1="60" x2={W} y2="60" />
          <line x1="0" y1="115" x2={W} y2="115" />
          <line x1="0" y1="170" x2={W} y2="170" />
        </g>

        <path d={chart.area} fill="url(#areaG)" />
        <path d={chart.line} fill="none" stroke="url(#lineG)" strokeWidth="3.5" strokeLinecap="round" />

        <circle cx={chart.last.x} cy={chart.last.y} r="6" fill="#f5c518">
          <animate attributeName="r" values="6;9;6" dur="1.6s" repeatCount="indefinite" />
        </circle>

        <g fill="rgba(255,255,255,.45)" fontSize="11">
          {chart.labels.map((c) => (
            <text key={c.t} x={Math.min(c.x, W - 44)} y={H - 14}>
              {tick(c.t)}
            </text>
          ))}
          <text x="4" y={TOP + 4}>
            {money(chart.max)}
          </text>
        </g>
      </svg>
    </div>
  )
}
