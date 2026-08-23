/**
 * How money already recorded divided between creators and the platform.
 *
 * Arc lengths come from summed earnings rows, not from the live Global Split
 * setting. Changing the setting only affects new sales; this chart stays a
 * picture of history until enough new volume moves the mix.
 */
const R = 71
const CIRC = 2 * Math.PI * R

const short = (v) => {
  const n = Number(v || 0)
  if (n >= 1_000_000) return 'TZS ' + (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return 'TZS ' + Math.round(n / 1_000) + 'K'
  return 'TZS ' + n.toLocaleString()
}

export default function DonutChart({ creatorTzs = 0, platformTzs = 0 }) {
  const creators = Number(creatorTzs) || 0
  const platform = Number(platformTzs) || 0
  const total = creators + platform

  const creatorPct = total ? Math.round((creators / total) * 100) : 0
  const platformPct = total ? 100 - creatorPct : 0

  const creatorLen = total ? (creators / total) * CIRC : 0
  const platformLen = CIRC - creatorLen

  return (
    <div className="donut-wrap">
      <div className="donut">
        <svg
          width="180"
          height="180"
          viewBox="0 0 180 180"
          role="img"
          aria-label={`Historical revenue: creators ${creatorPct}%, platform ${platformPct}%`}
        >
          <defs>
            <linearGradient id="dg1" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#7c3aed" />
              <stop offset="100%" stopColor="#a78bfa" />
            </linearGradient>
          </defs>
          <circle className="track" cx="90" cy="90" r={R} />
          <circle
            className="seg1"
            cx="90"
            cy="90"
            r={R}
            style={{ strokeDasharray: `${creatorLen} ${CIRC}`, strokeDashoffset: 0 }}
          />
          <circle
            className="seg2"
            cx="90"
            cy="90"
            r={R}
            style={{
              strokeDasharray: `${platformLen} ${CIRC}`,
              strokeDashoffset: -creatorLen,
            }}
          />
        </svg>
        <div className="donut-center">
          <b>{short(total)}</b>
          <small>Total recorded</small>
        </div>
      </div>
      <div className="legend">
        <span>
          <i style={{ background: 'linear-gradient(135deg,#7c3aed,#a78bfa)' }} />
          Creators ({creatorPct}%) · {short(creators)}
        </span>
        <span>
          <i style={{ background: 'var(--gold)' }} />
          Platform ({platformPct}%) · {short(platform)}
        </span>
      </div>
    </div>
  )
}
