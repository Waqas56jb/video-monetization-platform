import { useMemo } from 'react'

/**
 * Platform revenue over time, drawn from what actually happened.
 *
 * This used to be a hand-drawn SVG path with invented peaks — a picture of a
 * business rather than a picture of this one. It now plots whatever the
 * earnings table holds, and draws nothing at all when that is empty.
 *
 * `series`: [{ month | day, gross, platform }]
 */
const W = 600
const H = 230
const PAD_TOP = 20
const PAD_BOTTOM = 45

export default function RevenueAreaChart({ series = [], valueKey = 'gross', label = 'Platform revenue' }) {
  const chart = useMemo(() => {
    const points = series
      .map((p) => ({
        t: p.month || p.day || p.date,
        v: Number(p[valueKey] ?? 0),
      }))
      .filter((p) => p.t)

    if (points.length < 2) return null

    const max = Math.max(...points.map((p) => p.v), 1)
    const stepX = W / (points.length - 1)
    const scaleY = (v) => H - PAD_BOTTOM - (v / max) * (H - PAD_TOP - PAD_BOTTOM)

    const coords = points.map((p, i) => ({ x: i * stepX, y: scaleY(p.v), ...p }))

    // A gentle cubic through the points reads better than straight segments at
    // this size, and never overshoots into a negative-looking dip.
    const line = coords
      .map((c, i) => {
        if (i === 0) return `M${c.x.toFixed(1)},${c.y.toFixed(1)}`
        const prev = coords[i - 1]
        const cx = (prev.x + c.x) / 2
        return `C${cx.toFixed(1)},${prev.y.toFixed(1)} ${cx.toFixed(1)},${c.y.toFixed(1)} ${c.x.toFixed(1)},${c.y.toFixed(1)}`
      })
      .join(' ')

    const area = `${line} L${W},${H - PAD_BOTTOM} L0,${H - PAD_BOTTOM} Z`

    // At most five labels, however many points there are.
    const every = Math.max(1, Math.ceil(coords.length / 5))
    const labels = coords.filter((_, i) => i % every === 0 || i === coords.length - 1)

    return { coords, line, area, labels, max, last: coords[coords.length - 1] }
  }, [series, valueKey])

  if (!chart) {
    return (
      <div className="chart-wrap chart-thin">
        <p style={{ color: 'var(--muted2)', fontSize: 13, textAlign: 'center', margin: '46px 0' }}>
          Not enough activity to plot yet — this fills in as sales come through.
        </p>
      </div>
    )
  }

  const fmt = (v) =>
    v >= 1_000_000 ? (v / 1_000_000).toFixed(1) + 'M' : v >= 1_000 ? Math.round(v / 1_000) + 'K' : String(v)

  const tick = (iso) => {
    const d = new Date(iso)
    return Number.isNaN(d.getTime())
      ? String(iso).slice(0, 6)
      : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: peak ${fmt(chart.max)}`}>
        <defs>
          <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7c3aed" stopOpacity=".45" />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="lg" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>
        </defs>

        <g stroke="rgba(255,255,255,.05)">
          <line x1="0" y1="55" x2={W} y2="55" />
          <line x1="0" y1="110" x2={W} y2="110" />
          <line x1="0" y1="165" x2={W} y2="165" />
        </g>

        <path d={chart.area} fill="url(#ag)" />
        <path d={chart.line} fill="none" stroke="url(#lg)" strokeWidth="3.5" strokeLinecap="round" />

        <circle cx={chart.last.x} cy={chart.last.y} r="6" fill="#f5c518">
          <animate attributeName="r" values="6;9;6" dur="1.6s" repeatCount="indefinite" />
        </circle>

        <g fill="rgba(255,255,255,.45)" fontSize="11">
          {chart.labels.map((c) => (
            <text key={c.t} x={Math.min(c.x, W - 40)} y={H - 14}>
              {tick(c.t)}
            </text>
          ))}
          <text x="4" y={PAD_TOP + 4}>
            {fmt(chart.max)}
          </text>
        </g>
      </svg>
    </div>
  )
}
