import { PAYMENT_BARS } from '@/data/adminData'

/**
 * "Payments per Day" bars. The gradient is declared locally (rather than
 * borrowed from the revenue chart) so this tab renders standalone.
 */
export default function PaymentsBarChart() {
  return (
    <div className="chart-wrap">
      <svg viewBox="0 0 600 240" role="img" aria-label="Payments per day, last 14 days">
        <defs>
          <linearGradient id="barG" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>
        </defs>
        <g fill="url(#barG)">
          {PAYMENT_BARS.map((b) => (
            <rect
              key={b.x}
              x={b.x}
              y={b.y}
              width="26"
              height={b.h}
              rx="6"
              {...(b.fill ? { fill: b.fill } : {})}
            />
          ))}
        </g>
      </svg>
    </div>
  )
}
