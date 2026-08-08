import { DatabaseBackup, History, Save } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Field from '@/components/ui/Field'
import { ToggleRow } from '@/components/ui/Switch'
import { useToast } from '@/context/ToastContext'
import { PLATFORM_SETTINGS, TOASTS } from '@/data/adminData'

export default function SettingsTab() {
  const showToast = useToast()

  return (
    <div className="tab">
      <div className="two-col">
        <Panel title="Platform Settings">
          {PLATFORM_SETTINGS.map((s) => (
            <ToggleRow key={s.id} setting={s} />
          ))}
        </Panel>

        <Panel title="Payment Settings">
          <Field
            id="min-price"
            label="Minimum video price (TZS)"
            icon="banknote"
            type="text"
            defaultValue="200"
          />
          <Field
            id="min-withdrawal"
            label="Minimum withdrawal (TZS)"
            icon="banknote"
            type="text"
            defaultValue="50,000"
          />
          <Field
            id="default-preview"
            label="Default free preview limit"
            icon="timer"
            type="text"
            defaultValue="5 minutes (creator adjustable)"
          />
          <button className="btn btn-gold" onClick={() => showToast(TOASTS.paymentSettings)}>
            <Save />
            Save Settings
          </button>

          <div style={{ marginTop: 22, paddingTop: 20, borderTop: '1px solid var(--border2)' }}>
            <div className="panel-head" style={{ marginBottom: 14 }}>
              <h3>Database Backups</h3>
              <span className="pill ok">Daily · Automated</span>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => showToast(TOASTS.backupNow)}>
                <DatabaseBackup />
                Backup Now
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => showToast(TOASTS.viewBackups)}>
                <History />
                View Backups
              </button>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  )
}
