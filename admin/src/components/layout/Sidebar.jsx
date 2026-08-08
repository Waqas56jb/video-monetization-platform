import { Fragment, useMemo } from 'react'
import { NavLink } from 'react-router-dom'
import { LogOut, Play } from 'lucide-react'
import Icon from '@/components/ui/Icon'
import { useAuth } from '@/context/AuthContext'
import { useNotifications } from '@/context/NotificationsContext'

/**
 * Navigation, filtered by what this person is actually allowed to open.
 *
 * A sub-admin does not see Users, Creators or Settings at all. Hiding them is
 * not the security — the routes refuse them and so does the database — but a
 * menu full of doors that slam in your face is a bad way to work.
 */
const NAV = [
  {
    label: 'Overview',
    items: [
      { path: '/dashboard', icon: 'layout-dashboard', label: 'Dashboard' },
      { path: '/analytics', icon: 'bar-chart-3', label: 'Analytics' },
      { path: '/notifications', icon: 'bell', label: 'Notifications', badge: 'unread' },
    ],
  },
  {
    label: 'Management',
    items: [
      { path: '/users', icon: 'users', label: 'Users', adminOnly: true },
      { path: '/creators', icon: 'video', label: 'Creators', adminOnly: true },
      { path: '/videos', icon: 'clapperboard', label: 'Videos' },
      { path: '/review', icon: 'shield-check', label: 'Content Review', badge: 'review' },
      { path: '/moderation', icon: 'shield-alert', label: 'Moderation' },
    ],
  },
  {
    label: 'Communication',
    items: [{ path: '/announcements', icon: 'megaphone', label: 'Announcements' }],
  },
  {
    label: 'Finance',
    items: [
      { path: '/payments', icon: 'credit-card', label: 'Payments' },
      { path: '/withdrawals', icon: 'banknote', label: 'Withdrawals', badge: 'withdrawals' },
      { path: '/revenue', icon: 'percent', label: 'Revenue & Splits', adminOnly: true },
      { path: '/ads', icon: 'megaphone', label: 'Ads Management' },
    ],
  },
  {
    label: 'System',
    items: [
      { path: '/audit', icon: 'scroll-text', label: 'Audit Log' },
      { path: '/settings', icon: 'settings', label: 'Settings' },
    ],
  },
]

export default function Sidebar({ open, onClose, onLogout, counts = {} }) {
  const { isAdmin, roleLabel, user } = useAuth()
  const { unread } = useNotifications()

  const groups = useMemo(
    () =>
      NAV.map((g) => ({
        ...g,
        items: g.items.filter((i) => !i.adminOnly || isAdmin),
      })).filter((g) => g.items.length),
    [isAdmin]
  )

  const badgeFor = (key) => {
    if (!key) return null
    const n = key === 'unread' ? unread : counts[key]
    return n > 0 ? n : null
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
        <div className="logo">
          <span className="logo-mark">
            <Play />
          </span>
          <span className="logo-word">
            MTONYO<span className="logo-plus">+</span>
          </span>
        </div>
        <span className="admin-tag">{roleLabel}</span>

        {groups.map((group) => (
          <Fragment key={group.label}>
            <div className="side-label">{group.label}</div>
            {group.items.map((item) => {
              const count = badgeFor(item.badge)
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) => `side-link ${isActive ? 'on' : ''}`.trim()}
                  onClick={onClose}
                >
                  <Icon name={item.icon} />
                  {item.label}
                  {count != null && <span className="count">{count}</span>}
                </NavLink>
              )
            })}
          </Fragment>
        ))}

        <div className="side-foot">
          <div className="side-who">
            <b>{user?.fullName || user?.email}</b>
            <small>{user?.email}</small>
          </div>
          <button className="side-link" onClick={onLogout}>
            <LogOut />
            Log out
          </button>
        </div>
      </aside>
    </>
  )
}
