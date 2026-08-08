import { useMemo } from 'react'

/**
 * Payments per day, drawn from the transactions themselves.
 *
 * The bars used to be a fixed list of coordinates — a shape, not a
 * measurement. They now count real successful payments per day and scale to
 * whatever the busiest day happens to be.
 *
 * `payments`: rows with `created_at` and `status`
 */
const W = 600
const H = 240
const FLOOR = 200
const DAYS = 14

export default function PaymentsBarChart({ payments = [], days = DAYS }) {
  const bars = useMemo(() => {
    const buckets = new Map()
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      buckets.set(d.toISOString().slice(0, 10), 0)
    }

    for (const p of payments) {
      if (p.status !== 'success') continue
      const key = String(p.created_at).slice(0, 10)
      if (buckets.has(key)) buckets.set(key, buckets.get(key) + 1)
    }

    const entries = [...buckets.entries()]
    const max = Math.max(...entries.map(([, n]) => n), 1)
    const slot = W / entries.length
    const width = Math.min(26, slot * 0.6)

    return entries.map(([day, n], i) => ({
      day,
      n,
      x: i * slot + (slot - width) / 2,
      w: width,
      h: Math.max(2, (n / max) * (FLOOR - 20)),
    }))
  }, [payments, days])

  const total = bars.reduce((n, b) => n + b.n, 0)

  if (!total) {
    return (
      <div className="chart-wrap chart-thin">
        <p style={{ color: 'var(--muted2)', fontSize: 13, textAlign: 'center', margin: '46px 0' }}>
          No payments in the last {days} days.
        </p>
      </div>
    )
  }

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Payments per day: ${total} in ${days} days`}>
        <defs>
          <linearGradient id="barG" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>
        </defs>
        <g fill="url(#barG)">
          {bars.map((b) => (
            <rect key={b.day} x={b.x} y={FLOOR - b.h} width={b.w} height={b.h} rx="6" />
          ))}
        </g>
        <g fill="rgba(255,255,255,.45)" fontSize="11">
          {bars.map((b, i) =>
            i % Math.ceil(bars.length / 5) === 0 ? (
              <text key={b.day} x={b.x - 6} y={FLOOR + 22}>
                {new Date(b.day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
              </text>
            ) : null
          )}
        </g>
      </svg>
    </div>
  )
}
