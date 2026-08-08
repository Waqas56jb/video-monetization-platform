import { Plus } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import { StatGrid } from '@/components/ui/StatCard'
import { TableWrap } from '@/components/ui/Table'
import { ToggleRow } from '@/components/ui/Switch'
import { useToast } from '@/context/ToastContext'
import { AD_CAMPAIGNS, AD_SETTINGS, AD_STATS, TOASTS } from '@/data/adminData'

export default function AdsTab() {
  const showToast = useToast()

  return (
    <div className="tab">
      <StatGrid stats={AD_STATS} />

      <div className="two-col">
        <Panel title="Pre-Roll Ad Settings">
          {AD_SETTINGS.map((s) => (
            <ToggleRow key={s.id} setting={s} />
          ))}
        </Panel>

        <Panel
          title="Active Ad Campaigns"
          action={
            <button className="btn btn-purple btn-sm" onClick={() => showToast(TOASTS.newCampaign)}>
              <Plus />
              New Campaign
            </button>
          }
        >
          <TableWrap minWidth={0}>
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Impressions</th>
                <th>Revenue</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {AD_CAMPAIGNS.map((c) => (
                <tr key={c.id}>
                  <td>
                    <b>{c.name}</b>
                  </td>
                  <td>{c.impressions}</td>
                  <td className="money">{c.revenue}</td>
                  <td>
                    <span className={`pill ${c.pill}`}>{c.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Panel>
      </div>
    </div>
  )
}
