/**
 * Revenue-split donut. `#dg1` is declared here because
 * `.donut .seg1 { stroke: url(#dg1) }` in global.css resolves it by id.
 */
export default function DonutChart() {
  return (
    <div className="donut-wrap">
      <div className="donut">
        <svg
          width="180"
          height="180"
          viewBox="0 0 180 180"
          role="img"
          aria-label="Revenue split: creators 70%, platform 30%"
        >
          <defs>
            <linearGradient id="dg1" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#7c3aed" />
              <stop offset="100%" stopColor="#a78bfa" />
            </linearGradient>
          </defs>
          <circle className="track" cx="90" cy="90" r="71" />
          <circle className="seg1" cx="90" cy="90" r="71" />
          <circle className="seg2" cx="90" cy="90" r="71" />
        </svg>
        <div className="donut-center">
          <b>TZS 142.6M</b>
          <small>Total Revenue</small>
        </div>
      </div>
      <div className="legend">
        <span>
          <i style={{ background: 'linear-gradient(135deg,#7c3aed,#a78bfa)' }} />
          Creators (70%) · TZS 99.8M
        </span>
        <span>
          <i style={{ background: 'var(--gold)' }} />
          Platform (30%) · TZS 42.8M
        </span>
      </div>
    </div>
  )
}
