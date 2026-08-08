const AREA_PATH =
  'M0,190 C60,170 90,120 140,130 C190,140 220,80 280,90 C340,100 370,150 420,120 C470,90 510,40 600,55 L600,240 L0,240 Z'
const LINE_PATH =
  'M0,190 C60,170 90,120 140,130 C190,140 220,80 280,90 C340,100 370,150 420,120 C470,90 510,40 600,55'
const X_LABELS = [
  { x: 10, label: 'May 1' },
  { x: 150, label: 'May 8' },
  { x: 290, label: 'May 15' },
  { x: 430, label: 'May 22' },
  { x: 558, label: 'May 29' },
]

/** Revenue area chart — responsive via viewBox, with the pulsing end marker. */
export default function RevenueChart() {
  return (
    <div className="chart-wrap">
      <svg viewBox="0 0 600 240" role="img" aria-label="Revenue overview for this month">
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
          <line x1="0" y1="60" x2="600" y2="60" />
          <line x1="0" y1="120" x2="600" y2="120" />
          <line x1="0" y1="180" x2="600" y2="180" />
        </g>

        <path className="chart-area" d={AREA_PATH} fill="url(#areaG)" />
        <path
          className="chart-line"
          d={LINE_PATH}
          fill="none"
          stroke="url(#lineG)"
          strokeWidth="3.5"
          strokeLinecap="round"
        />

        <circle cx="600" cy="55" r="6" fill="#f5c518">
          <animate attributeName="r" values="6;9;6" dur="1.6s" repeatCount="indefinite" />
        </circle>

        <g fill="#6b6b80" fontSize="11" fontFamily="Inter">
          {X_LABELS.map((l) => (
            <text key={l.label} x={l.x} y="232">
              {l.label}
            </text>
          ))}
        </g>
      </svg>
    </div>
  )
}
