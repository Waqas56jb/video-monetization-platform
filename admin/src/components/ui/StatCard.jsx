import { TrendingUp } from 'lucide-react'
import Icon from './Icon'

/** KPI tile: icon, uppercase label, big number and an optional trend line. */
export default function StatCard({ stat }) {
  return (
    <div className={`stat-card ${stat.tone || ''}`.trim()}>
      <span className="sc-ic">
        <Icon name={stat.icon} />
      </span>
      <small>{stat.label}</small>
      <b>{stat.value}</b>
      {stat.trend && (
        <span className={`trend ${stat.trendDown ? 'down' : 'up'}`}>
          <TrendingUp />
          {stat.trend}
        </span>
      )}
    </div>
  )
}

/** The 4-up grid the stat cards always sit in. */
export function StatGrid({ stats, style }) {
  return (
    <div className="stat-grid" style={style}>
      {stats.map((s) => (
        <StatCard key={s.label} stat={s} />
      ))}
    </div>
  )
}
