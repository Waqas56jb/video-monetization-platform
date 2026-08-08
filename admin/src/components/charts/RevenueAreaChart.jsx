const AREA_PATH =
  'M0,185 C50,175 80,140 130,145 C180,150 210,95 270,105 C330,115 360,145 410,115 C460,85 510,45 600,50 L600,230 L0,230 Z'
const LINE_PATH =
  'M0,185 C50,175 80,140 130,145 C180,150 210,95 270,105 C330,115 360,145 410,115 C460,85 510,45 600,50'
const X_LABELS = [
  { x: 8, label: 'May 1' },
  { x: 150, label: 'May 8' },
  { x: 290, label: 'May 15' },
  { x: 425, label: 'May 22' },
  { x: 555, label: 'May 29' },
]

/** Platform revenue area chart with the pulsing end marker. */
export default function RevenueAreaChart() {
  return (
    <div className="chart-wrap">
      <svg viewBox="0 0 600 230" role="img" aria-label="Platform revenue this month">
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
          <line x1="0" y1="55" x2="600" y2="55" />
          <line x1="0" y1="110" x2="600" y2="110" />
          <line x1="0" y1="165" x2="600" y2="165" />
        </g>

        <path d={AREA_PATH} fill="url(#ag)" />
        <path d={LINE_PATH} fill="none" stroke="url(#lg)" strokeWidth="3.5" strokeLinecap="round" />

        <circle cx="600" cy="50" r="6" fill="#f5c518">
          <animate attributeName="r" values="6;9;6" dur="1.6s" repeatCount="indefinite" />
        </circle>

        <g fill="#6b6b80" fontSize="11" fontFamily="Inter">
          {X_LABELS.map((l) => (
            <text key={l.label} x={l.x} y="222">
              {l.label}
            </text>
          ))}
        </g>
      </svg>
    </div>
  )
}
