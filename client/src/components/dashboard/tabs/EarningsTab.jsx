import { Send } from 'lucide-react'
import Panel from '../Panel'
import StatCard from '../StatCard'
import Field from '@/components/ui/Field'
import { EARNINGS_STATS } from '@/data/content'
import { useToast } from '@/context/ToastContext'

export default function EarningsTab() {
  const showToast = useToast()

  return (
    <div>
      <div className="stat-grid">
        {EARNINGS_STATS.map((s) => (
          <StatCard key={s.label} stat={s} />
        ))}
      </div>

      <Panel title="Request Withdrawal">
        <div className="form-grid">
          <Field
            id="wd-amount"
            label="Amount (TZS)"
            icon="banknote"
            type="text"
            placeholder="e.g. 500,000"
            inputMode="numeric"
          />
          <Field
            id="wd-target"
            label="Send To"
            icon="smartphone"
            type="text"
            defaultValue="M-Pesa · 0712 *** 890"
          />
        </div>
        <button
          className="btn btn-gold"
          onClick={() => showToast('💸 Withdrawal requested — arrives within 24 hours')}
        >
          <Send />
          Withdraw to M-Pesa
        </button>
      </Panel>
    </div>
  )
}
