/**
 * How a creator's money actually divided.
 *
 * The arcs follow the real amounts rather than the headline split percentage,
 * so a creator on their own negotiated split sees their split — not the one
 * everybody else gets.
 */
const R = 75
const CIRC = 2 * Math.PI * R

const short = (v) => {
  const n = Number(v || 0)
  if (n >= 1_000_000) return 'TZS ' + (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return 'TZS ' + Math.round(n / 1_000) + 'K'
  return 'TZS ' + n.toLocaleString()
}

export default function DonutChart({ creatorTzs = 0, platformTzs = 0 }) {
  const yours = Number(creatorTzs) || 0
  const theirs = Number(platformTzs) || 0
  const total = yours + theirs

  /**
   * No money yet means no chart.
   *
   * With nothing to divide this drew a full ring reading 0% / TZS 0 — a chart
   * that looks like a measurement and measures nothing. An empty state says
   * the same thing honestly and tells the creator what fills it.
   */
  if (total <= 0) {
    return (
      <div className="donut-wrap donut-empty">
        <b>Nothing to split yet</b>
        <p>Your share and the platform&apos;s appear here as soon as somebody buys one of your videos.</p>
      </div>
    )
  }

  const yourPct = Math.round((yours / total) * 100)
  const theirPct = 100 - yourPct
  const yourLen = (yours / total) * CIRC

  return (
    <div className="donut-wrap">
      <div className="donut">
        <svg
          width="190"
          height="190"
          viewBox="0 0 190 190"
          role="img"
          aria-label={`Earnings split: you ${yourPct}%, platform ${theirPct}%`}
        >
          <defs>
            <linearGradient id="dgrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#7c3aed" />
              <stop offset="100%" stopColor="#a78bfa" />
            </linearGradient>
          </defs>
          <circle className="track" cx="95" cy="95" r={R} />
          {/* Set here rather than in CSS so the arcs can follow the real
              numbers instead of a fixed 70/30. */}
          <circle
            className="seg1"
            cx="95"
            cy="95"
            r={R}
            style={{ strokeDasharray: `${yourLen} ${CIRC}`, strokeDashoffset: 0 }}
          />
          <circle
            className="seg2"
            cx="95"
            cy="95"
            r={R}
            style={{ strokeDasharray: `${CIRC - yourLen} ${CIRC}`, strokeDashoffset: -yourLen }}
          />
        </svg>
        <div className="donut-center">
          <b>{short(yours)}</b>
          <small>Your earnings</small>
        </div>
      </div>
      <div className="legend">
        <span>
          <i style={{ background: 'linear-gradient(135deg,#7c3aed,#a78bfa)' }} />
          You ({yourPct}%) · {short(yours)}
        </span>
        <span>
          <i style={{ background: 'var(--gold)' }} />
          Platform ({theirPct}%) · {short(theirs)}
        </span>
      </div>
    </div>
  )
}
