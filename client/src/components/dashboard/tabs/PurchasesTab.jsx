import Panel from '../Panel'
import StatCard from '../StatCard'
import TableScroll from '@/components/ui/TableScroll'
import { VIEWER_PURCHASES, VIEWER_STATS } from '@/data/content'

/** Viewer-side receipt log — what they bought, how they paid, and its status. */
export default function PurchasesTab() {
  return (
    <div>
      <div className="stat-grid">
        {VIEWER_STATS.map((s) => (
          <StatCard key={s.label} stat={s} />
        ))}
      </div>

      <Panel
        title="Purchase History"
        action={<span className="link">All amounts in TZS</span>}
      >
        <TableScroll>
          <thead>
            <tr>
              <th>Date</th>
              <th>Video</th>
              <th>Creator</th>
              <th>Method</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {VIEWER_PURCHASES.map((p) => (
              <tr key={p.id}>
                <td>{p.date}</td>
                <td style={{ fontWeight: 700 }}>{p.video}</td>
                <td>{p.creator}</td>
                <td>{p.method}</td>
                <td style={{ color: 'var(--gold)', fontWeight: 700 }}>{p.amount}</td>
                <td>
                  <span className={`pill ${p.pill}`}>{p.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </TableScroll>
      </Panel>
    </div>
  )
}
