/**
 * Earnings-split donut. The `#dgrad` gradient lives here because
 * `.donut .seg1 { stroke: url(#dgrad) }` in global.css resolves it by id.
 */
export default function DonutChart() {
  return (
    <div className="donut-wrap">
      <div className="donut">
        <svg width="190" height="190" viewBox="0 0 190 190" role="img" aria-label="Earnings split: you 70%, platform 30%">
          <defs>
            <linearGradient id="dgrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#7c3aed" />
              <stop offset="100%" stopColor="#a78bfa" />
            </linearGradient>
          </defs>
          <circle className="track" cx="95" cy="95" r="75" />
          <circle className="seg1" cx="95" cy="95" r="75" />
          <circle className="seg2" cx="95" cy="95" r="75" />
        </svg>
        <div className="donut-center">
          <b>TZS 8.7M</b>
          <small>Total Earnings</small>
        </div>
      </div>
      <div className="legend">
        <span>
          <i style={{ background: 'linear-gradient(135deg,#7c3aed,#a78bfa)' }} />
          You (70%) · TZS 6.1M
        </span>
        <span>
          <i style={{ background: 'var(--gold)' }} />
          Platform · TZS 2.6M
        </span>
      </div>
    </div>
  )
}
