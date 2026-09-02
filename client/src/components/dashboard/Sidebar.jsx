import { Fragment, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Logo from '@/components/ui/Logo'
import Icon from '@/components/ui/Icon'
import { useToast } from '@/context/ToastContext'
import { useRole } from '@/context/AuthContext'

/**
 * Sidebar menu, filtered by the SIDES this account actually has.
 *
 * It used to filter by a single role on the assumption that one account both
 * watches and sells — so a Create-only account was offered My Library and My
 * Purchases, which belong to a Watch account it does not have. Watch and Create
 * are separate accounts that share an email and a password: each is signed up
 * for on its own, and the menu shows what has been signed up for.
 *
 * `roles` still decides which group an item belongs to; `sides` decides whether
 * that group is shown at all. When a side is missing the menu offers to add it,
 * because that is now something a person can do for themselves.
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
      { tab: 'upload', icon: 'upload-cloud', label: 'Uploads', roles: ['creator'] },
      { tab: 'videos', filter: 'drafts', icon: 'hourglass', label: 'Drafts', roles: ['creator'] },
      { tab: 'videos', filter: 'published', icon: 'clapperboard', label: 'Published', roles: ['creator'] },
      { tab: 'analytics', icon: 'bar-chart-3', label: 'Analytics', roles: ['creator'] },
      { tab: 'earnings', icon: 'wallet', label: 'Revenue & Payouts', roles: ['creator'] },
    ],
  },
  {
    label: 'Start Selling',
    roles: ['viewer'],
    items: [{ tab: 'become', icon: 'rocket', label: 'Apply to become a Creator', roles: ['viewer'] }],
  },
  {
    label: 'Account',
    roles: ['viewer', 'creator'],
    items: [
      { tab: 'profile', icon: 'user-cog', label: 'Profile settings', roles: ['viewer', 'creator'] },
      { tab: 'settings', icon: 'settings', label: 'Settings', roles: ['viewer', 'creator'] },
    ],
  },
]

export default function Sidebar({ open, activeTab, activeFilter = '', onTab, onClose }) {
  const navigate = useNavigate()
  const showToast = useToast()
  const { role, signOut, isCreator, accountSide, setAccountSide, accountRole, sides } = useRole()
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

  /**
   * Staff see everything: an administrator's account is not two sides, and
   * hiding the studio from them would break the review work they do in it.
   */
  const staff = role === 'admin' || role === 'sub_admin'
  const hasWatch = staff || sides?.viewer !== false
  const hasStudio = staff || Boolean(sides?.creator) || isCreator

  const visible = GROUPS.filter((g) => g.roles.includes(menuRole))
    .filter((g) => (g.label === 'Watch' ? hasWatch : g.label === 'Creator Studio' ? hasStudio : true))
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

  /**
   * The side this account does not have, offered as something to add.
   *
   * Signing up on the missing side with the same email and password opens it —
   * that is the whole of it now — so this is a link to that sign-up rather than
   * to an application anyone has to wait on.
   */
  const missingSide = !staff && !hasWatch ? 'viewer' : !staff && !hasStudio ? 'creator' : null

  const activate = (item) => {
    if (item.tab) return onTab(item.tab, item.filter ? { filter: item.filter } : {})
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
            {group.items.map((item) => {
              const on =
                item.tab &&
                item.tab === activeTab &&
                (item.filter || '') === (item.tab === 'videos' ? activeFilter || '' : '')
              return (
              <button
                key={item.label}
                className={`side-link ${on ? 'on' : ''}`.trim()}
                onClick={() => activate(item)}
              >
                <Icon name={item.icon} />
                {item.label}
              </button>
              )
            })}
          </Fragment>
        ))}

        {/**
          * The side this account does not have.
          *
          * Watch and Create are separate accounts on one email, so an account
          * with only one of them is normal — but it should be able to see that,
          * and to add the other. Signing up on the missing side with the same
          * email and password opens it.
          */}
        {missingSide && (
          <Fragment>
            <div className="side-label">{missingSide === 'creator' ? 'Start Selling' : 'Start Watching'}</div>
            <button
              className="side-link"
              type="button"
              onClick={() => {
                onClose()
                navigate(`/signup?side=${missingSide}`)
              }}
            >
              <Icon name={missingSide === 'creator' ? 'rocket' : 'library'} />
              {missingSide === 'creator' ? 'Add a Creator account' : 'Add a Watch account'}
            </button>
          </Fragment>
        )}

        <div className="side-foot">
          {accountRole === 'admin' && isCreator && (
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
