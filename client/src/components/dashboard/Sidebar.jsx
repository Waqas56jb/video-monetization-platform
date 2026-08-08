import { Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import Logo from '@/components/ui/Logo'
import Icon from '@/components/ui/Icon'
import { useToast } from '@/context/ToastContext'

/** Sidebar groups. `tab` items switch the view; `toast` items are placeholders. */
const GROUPS = [
  {
    label: 'Menu',
    items: [
      { tab: 'overview', icon: 'layout-dashboard', label: 'Dashboard' },
      { tab: 'library', icon: 'library', label: 'My Library' },
      { tab: 'upload', icon: 'upload-cloud', label: 'Upload Video' },
    ],
  },
  {
    label: 'Creator Studio',
    items: [
      { tab: 'videos', icon: 'clapperboard', label: 'My Videos' },
      { tab: 'earnings', icon: 'wallet', label: 'Earnings' },
      { toast: 'Analytics coming in your full build', icon: 'bar-chart-3', label: 'Analytics' },
      { toast: 'Transactions coming in your full build', icon: 'receipt', label: 'Transactions' },
    ],
  },
  {
    label: 'Account',
    items: [
      { toast: 'Profile settings', icon: 'user-cog', label: 'My Profile' },
      { toast: 'Settings', icon: 'settings', label: 'Settings' },
    ],
  },
]

export default function Sidebar({ open, activeTab, onTab, onClose }) {
  const navigate = useNavigate()
  const showToast = useToast()

  const logout = () => {
    navigate('/')
    showToast('Logged out — see you soon!')
  }

  return (
    <>
      <button
        className={`sidebar-scrim ${open ? 'show' : ''}`.trim()}
        onClick={onClose}
        aria-label="Close menu"
        tabIndex={open ? 0 : -1}
      />

      <aside className={`sidebar ${open ? 'open' : ''}`.trim()}>
        <Logo onClick={onClose} />

        {GROUPS.map((group) => (
          <Fragment key={group.label}>
            <div className="side-label">{group.label}</div>
            {group.items.map((item) => (
              <button
                key={item.label}
                className={`side-link ${item.tab && item.tab === activeTab ? 'on' : ''}`.trim()}
                onClick={() => (item.tab ? onTab(item.tab) : showToast(item.toast))}
              >
                <Icon name={item.icon} />
                {item.label}
              </button>
            ))}
          </Fragment>
        ))}

        <div className="side-foot">
          <button className="side-link" onClick={logout}>
            <Icon name="log-out" />
            Log out
          </button>
        </div>
      </aside>
    </>
  )
}
