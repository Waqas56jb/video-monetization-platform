import Panel from '../Panel'
import StatCard from '../StatCard'
import RevenueChart from '../RevenueChart'
import DonutChart from '../DonutChart'
import { OVERVIEW_STATS, TRANSACTIONS } from '@/data/content'

export default function OverviewTab() {
  return (
    <div>
      <div className="stat-grid">
        {OVERVIEW_STATS.map((s) => (
          <StatCard key={s.label} stat={s} />
        ))}
      </div>

      <div className="two-col">
        <Panel title="Revenue Overview" action={<span className="link">This Month</span>}>
          <RevenueChart />
        </Panel>

        <Panel title="Earnings Breakdown">
          <DonutChart />
        </Panel>
      </div>

      <Panel title="Recent Transactions" action={<span className="link">View All</span>}>
        <div className="table-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Video</th>
                <th>Method</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {TRANSACTIONS.map((t, i) => (
                <tr key={`${t.date}-${t.type}-${i}`}>
                  <td>{t.date}</td>
                  <td>{t.type}</td>
                  <td>{t.video}</td>
                  <td>{t.method}</td>
                  <td style={{ color: `var(--${t.tone})`, fontWeight: 700 }}>{t.amount}</td>
                  <td>
                    <span className={`pill ${t.pill}`}>{t.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
