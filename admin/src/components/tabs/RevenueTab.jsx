import { useState } from 'react'
import { Save } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import { StatGrid } from '@/components/ui/StatCard'
import { IconButton, TableWrap } from '@/components/ui/Table'
import { useToast } from '@/context/ToastContext'
import { PLATFORM_EARNINGS, SPLIT_OVERRIDES, TOASTS } from '@/data/adminData'

export default function RevenueTab() {
  const showToast = useToast()
  const [creatorShare, setCreatorShare] = useState(70)

  return (
    <div className="tab">
      <div className="two-col">
        <Panel
          title="Global Revenue Split"
          action={<span className="pill ok">Applies to all new sales</span>}
        >
          <div className="split-config">
            <div className="split-vis">
              <span style={{ width: `${creatorShare}%` }} />
              <span />
            </div>

            <div className="range-row">
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>Creator share</span>
              <input
                type="range"
                min="50"
                max="90"
                value={creatorShare}
                aria-label="Creator share percentage"
                onChange={(e) => setCreatorShare(Number(e.target.value))}
              />
              <span className="range-val">
                {creatorShare}% / {100 - creatorShare}%
              </span>
            </div>

            <div className="legend" style={{ justifyContent: 'flex-start' }}>
              <span>
                <i style={{ background: 'linear-gradient(135deg,#7c3aed,#a78bfa)' }} />
                Creator share
              </span>
              <span>
                <i style={{ background: 'var(--gold)' }} />
                Platform share
              </span>
            </div>

            <button
              className="btn btn-gold"
              style={{ width: 'fit-content' }}
              onClick={() => showToast(TOASTS.globalSplit)}
            >
              <Save />
              Save Global Split
            </button>
          </div>
        </Panel>

        <Panel title="Per-Creator Overrides">
          <TableWrap minWidth={0}>
            <thead>
              <tr>
                <th>Creator</th>
                <th>Split</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {SPLIT_OVERRIDES.map((o) => (
                <tr key={o.id}>
                  <td>{o.creator}</td>
                  <td>
                    {o.custom ? (
                      <b style={{ color: 'var(--purple2)' }}>{o.split}</b>
                    ) : (
                      <span style={{ color: 'var(--muted)' }}>{o.split}</span>
                    )}
                  </td>
                  <td>
                    <IconButton
                      icon="pencil"
                      title={`Edit ${o.creator} split`}
                      onClick={() => showToast(TOASTS.overrideEditor)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Panel>
      </div>

      <Panel title="Platform Earnings Summary">
        <StatGrid stats={PLATFORM_EARNINGS} style={{ margin: 0 }} />
      </Panel>
    </div>
  )
}
