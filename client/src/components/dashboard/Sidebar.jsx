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
  const { role, signOut, isCreator, accountSide, setAccountSide } = useRole()
  const [signingOut, setSigningOut] = useState(false)
  // Staff who open the public app get the creator menu, not an empty sidebar.
  /**
   * An admin passes the server's creator check, so the creator menu works for
   * them — the screens are simply empty, which is honest.
   *
   * A sub-admin does not. `requireCreator` lets an admin through and refuses
   * everyone else, so every one of those screens answered them with "This
   * action requires the creator role" — Overview, Upload, My Videos and
   * Earnings, four tabs, four red error panels. On the public site a sub-admin
   * is a viewer; their actual work is in the control centre.
   */
  const menuRole = role === 'admin' ? 'creator' : role === 'sub_admin' ? 'viewer' : role || 'viewer'

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

  const visible = GROUPS.filter((g) => g.roles.includes(menuRole))
    .map((g) => ({
      ...g,
      items: g.items.filter(
        (i) =>
          i.roles.includes(menuRole) &&
          /* Not for staff. Taking it would set their role to `creator` and
             quietly strip the sub-admin access they were given. */
          !(i.tab === 'become' && (role === 'sub_admin' || isCreator))
      ),
    }))
    // A group whose every item was filtered out should not leave a heading
    // floating over nothing.
    .filter((g) => g.items.length > 0)

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
        <span className={`role-chip role-${menuRole}`}>
          {menuRole === 'creator' ? 'CREATOR ACCOUNT' : 'VIEWER ACCOUNT'}
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
          {isCreator && (
            <button
              className="side-link"
              type="button"
              onClick={() => {
                const next = accountSide === 'creator' ? 'viewer' : 'creator'
                setAccountSide(next)
                onTab(next === 'creator' ? 'overview' : 'library')
              }}
            >
              <Icon name={accountSide === 'creator' ? 'user' : 'video'} />
              Open {accountSide === 'creator' ? 'Viewer' : 'Creator'} side
            </button>
          )}
          <button className="side-link" onClick={logout} disabled={signingOut}>
            <Icon name="log-out" />
            {signingOut ? 'Signing out…' : 'Log out'}
          </button>
        </div>
      </aside>
    </>
  )
}
