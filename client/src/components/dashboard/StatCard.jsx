import { Banknote, TrendingUp } from 'lucide-react'
import Icon from '@/components/ui/Icon'
import { useToast } from '@/context/ToastContext'

/** KPI tile: icon, label, big number, and either a trend line or a withdraw CTA. */
export default function StatCard({ stat }) {
  const showToast = useToast()

  return (
    <div className={`stat-card ${stat.tone || ''}`.trim()}>
      <span className="sc-ic">
        <Icon name={stat.icon} />
      </span>
      <small>{stat.label}</small>
      <b>{stat.value}</b>

      {stat.trend && (
        <span className="trend">
          <TrendingUp />
          {stat.trend}
        </span>
      )}

      {stat.withdraw && (
        <button
          className="btn btn-gold btn-sm"
          style={{ marginTop: 10 }}
          onClick={() => showToast('Withdrawal request sent — processed within 24h')}
        >
          <Banknote />
          Withdraw
        </button>
      )}
    </div>
  )
}
