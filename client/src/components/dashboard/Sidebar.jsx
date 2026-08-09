import { Fragment, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Logo from '@/components/ui/Logo'
import Icon from '@/components/ui/Icon'
import { useToast } from '@/context/ToastContext'
import { useRole } from '@/context/AuthContext'

/**
 * Sidebar menu, filtered by role.
 *
 * A viewer only sees the watching side of the product — their library, what
 * they have paid for, and the route to becoming a creator. A creator sees all
 * of that plus the studio, because on MTONYO+ one account both watches and
 * sells. `roles` on each group/item decides who sees what.
 */
const GROUPS = [
  {
    label: 'Watch',
    roles: ['viewer', 'creator'],
    items: [
      { tab: 'library', icon: 'library', label: 'My Library', roles: ['viewer', 'creator'] },
      { to: '/explore', icon: 'layout-grid', label: 'Explore Videos', roles: ['viewer', 'creator'] },
      { tab: 'purchases', icon: 'receipt', label: 'My Purchases', roles: ['viewer', 'creator'] },
      { tab: 'analytics', icon: 'bar-chart-3', label: 'My Activity', roles: ['viewer'] },
    ],
  },
  {
    label: 'Creator Studio',
    roles: ['creator'],
    items: [
      { tab: 'overview', icon: 'layout-dashboard', label: 'Dashboard', roles: ['creator'] },
      { tab: 'upload', icon: 'upload-cloud', label: 'Upload Video', roles: ['creator'] },
      { tab: 'videos', icon: 'clapperboard', label: 'My Videos', roles: ['creator'] },
      { tab: 'earnings', icon: 'wallet', label: 'Earnings', roles: ['creator'] },
      { tab: 'analytics', icon: 'bar-chart-3', label: 'Analytics', roles: ['creator'] },
    ],
  },
  {
    label: 'Start Selling',
    roles: ['viewer'],
    items: [{ tab: 'become', icon: 'rocket', label: 'Become a Creator', roles: ['viewer'] }],
  },
  {
    label: 'Account',
    roles: ['viewer', 'creator'],
    items: [
      { tab: 'profile', icon: 'user-cog', label: 'My Profile', roles: ['viewer', 'creator'] },
      { tab: 'settings', icon: 'settings', label: 'Settings', roles: ['viewer', 'creator'] },
    ],
  },
]

export default function Sidebar({ open, activeTab, onTab, onClose }) {
  const navigate = useNavigate()
  const showToast = useToast()
  const { role, signOut } = useRole()
  const [signingOut, setSigningOut] = useState(false)

  /**
   * Sign out, then leave.
   *
   * Awaited on purpose: this used to navigate away while the session was still
   * being cleared, so the dashboard could re-read a token that had not gone
   * yet and bounce straight back. Whatever happens to the request, the local
   * session is cleared — signOut handles that — so this always ends up
   * signed out.
   */
  const logout = async () => {
    if (signingOut) return
    setSigningOut(true)
    try {
      await signOut()
    } finally {
      onClose()
      navigate('/', { replace: true })
      showToast('Logged out — see you soon!')
    }
  }

  const visible = GROUPS.filter((g) => g.roles.includes(role)).map((g) => ({
    ...g,
    items: g.items.filter((i) => i.roles.includes(role)),
  }))

  const activate = (item) => {
    if (item.tab) return onTab(item.tab)
    if (item.to) {
      onClose()
      return navigate(item.to)
    }
    showToast(item.toast)
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
        <span className={`role-chip role-${role}`}>
          {role === 'creator' ? 'CREATOR ACCOUNT' : 'VIEWER ACCOUNT'}
        </span>

        {visible.map((group) => (
          <Fragment key={group.label}>
            <div className="side-label">{group.label}</div>
            {group.items.map((item) => (
              <button
                key={item.label}
                className={`side-link ${item.tab && item.tab === activeTab ? 'on' : ''}`.trim()}
                onClick={() => activate(item)}
              >
                <Icon name={item.icon} />
                {item.label}
              </button>
            ))}
          </Fragment>
        ))}

        <div className="side-foot">
          <button className="side-link" onClick={logout} disabled={signingOut}>
            <Icon name="log-out" />
            {signingOut ? 'Signing out…' : 'Log out'}
          </button>
        </div>
      </aside>
    </>
  )
}
