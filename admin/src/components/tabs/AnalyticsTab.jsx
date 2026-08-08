import Panel from '@/components/ui/Panel'
import { StatGrid } from '@/components/ui/StatCard'
import { TableWrap, VideoCell } from '@/components/ui/Table'
import PaymentsBarChart from '@/components/charts/PaymentsBarChart'
import MeterList from '@/components/charts/MeterList'
import { useToast } from '@/context/ToastContext'
import { ANALYTICS_STATS, PAYMENT_METHOD_METERS, TOASTS, TOP_VIDEOS } from '@/data/adminData'

export default function AnalyticsTab() {
  const showToast = useToast()

  return (
    <div className="tab">
      <StatGrid stats={ANALYTICS_STATS} />

      <div className="two-col">
        <Panel title="Payments per Day" action={<span className="link">Last 14 days</span>}>
          <PaymentsBarChart />
        </Panel>

        <Panel title="Payment Methods">
          <MeterList meters={PAYMENT_METHOD_METERS} />
        </Panel>
      </div>

      <Panel
        title="Top Videos (This Month)"
        action={
          <span className="link" onClick={() => showToast(TOASTS.exportCsv)}>
            Export CSV
          </span>
        }
      >
        <TableWrap>
          <thead>
            <tr>
              <th>#</th>
              <th>Video</th>
              <th>Creator</th>
              <th>Type</th>
              <th>Views</th>
              <th>Paid Unlocks</th>
              <th>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {TOP_VIDEOS.map((v) => (
              <tr key={v.rank}>
                <td>{v.rank}</td>
                <td>
                  <VideoCell thumb={v.thumb} title={v.title} />
                </td>
                <td>{v.creator}</td>
                <td>
                  <span className={`pill ${v.pill}`}>{v.type}</span>
                </td>
                <td>{v.views}</td>
                <td>{v.unlocks}</td>
                <td className="money">{v.revenue}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Panel>
    </div>
  )
}
