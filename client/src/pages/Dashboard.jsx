import { useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { Home, Menu, ShieldAlert } from 'lucide-react'
import Sidebar from '@/components/dashboard/Sidebar'
import OverviewTab from '@/components/dashboard/tabs/OverviewTab'
import LibraryTab from '@/components/dashboard/tabs/LibraryTab'
import UploadTab from '@/components/dashboard/tabs/UploadTab'
import ProfileTab from '@/components/dashboard/tabs/ProfileTab'
import SettingsTab from '@/components/dashboard/tabs/SettingsTab'
import AnalyticsTab from '@/components/dashboard/tabs/AnalyticsTab'
import MyVideosTab from '@/components/dashboard/tabs/MyVideosTab'
import EarningsTab from '@/components/dashboard/tabs/EarningsTab'
import PurchasesTab from '@/components/dashboard/tabs/PurchasesTab'
import BecomeCreatorTab from '@/components/dashboard/tabs/BecomeCreatorTab'
import useLockBodyScroll from '@/hooks/useLockBodyScroll'
import { DASH_TITLES } from '@/data/copy'
import NotificationBell from '@/components/dashboard/NotificationBell'
import { useAuth } from '@/context/AuthContext'
import { Skeleton, EmptyState } from '@/components/ui/States'

/** Which tabs each role is allowed to open. */
const ACCOUNT_TABS = ['analytics', 'profile', 'settings']
const CREATOR_TABS = ['overview', 'library', 'purchases', 'upload', 'videos', 'earnings']

const TABS_BY_ROLE = {
  viewer: ['library', 'purchases', 'become', ...ACCOUNT_TABS],
  creator: [...CREATOR_TABS, ...ACCOUNT_TABS],

  /**
   * An admin passes the creator role check on the server, so the creator tabs
   * work for them — they simply show nothing, which is honest.
   */
  admin: [...CREATOR_TABS, ...ACCOUNT_TABS],

  /**
   * A sub-admin does NOT.
   *
   * `requireCreator` lets an admin through and refuses everyone else, so every
   * creator endpoint answered a sub-admin with "This action requires the creator
   * role" — and they were being shown Overview, Upload, My Videos and Earnings
   * anyway. Four tabs, each one a red error panel. That is exactly what the
   * screenshots show.
   *
   * On the public site a sub-admin is a viewer: they watch and they buy. Their
   * actual work is in the control centre. "Become a creator" is left out
   * deliberately — taking it would set their role to `creator` and quietly
   * strip the staff access they were given.
   */
  sub_admin: ['library', 'purchases', ...ACCOUNT_TABS],
}

/** Where each role lands when it opens the dashboard. */
const HOME_TAB = {
  viewer: 'library',
  creator: 'overview',
  admin: 'overview',
  sub_admin: 'library',
}

/** Map any known (or unknown) role onto a safe dashboard key. */
function dashRole(role) {
  if (role && TABS_BY_ROLE[role]) return role
  return 'viewer'
}

export default function Dashboard() {
  const { role, isCreator, user, loading, authed, accountSide } = useAuth()
  const safeRole = dashRole(role)
  const [params, setParams] = useSearchParams()
  const [drawerOpen, setDrawerOpen] = useState(false)

  /**
   * Which tab is open lives in the URL.
   *
   * The whole dashboard is one route, and the open tab used to be React state.
   * The browser therefore had no idea the person had moved from Library to
   * Upload to My Videos — none of it was in the history. So Back from a video
   * came here and landed on whichever tab is home, which is not the tab they
   * left, and Back inside the dashboard skipped everything they had done and
   * left the dashboard entirely. That is the "it opens a different page"
   * everybody hits.
   *
   * `?tab=` fixes all of it at once: Back walks the tabs in order, Back from a
   * video returns to the tab it was opened from, and a link to a tab can be
   * sent to somebody. `/dashboard` still matches the same route, so nothing
   * about the routing changed.
   *
   * Derived rather than stored, so a role change cannot strand somebody on a
   * tab they may no longer open — the fallback is simply computed again.
   */
  const allowed = (TABS_BY_ROLE[safeRole] || TABS_BY_ROLE.viewer).filter(
    (t) => !(t === 'become' && isCreator)
  )
  const home = HOME_TAB[safeRole] || 'library'
  const requested = params.get('tab')
  const denied = Boolean(requested) && !allowed.includes(requested)
  const tab = allowed.includes(requested) ? requested : home

  // Greet the person who is actually signed in, not a name from a data file.
  const firstName = (user?.fullName || '').split(' ')[0]
  const contentFilter = params.get('filter') || ''
  const [title, subtitle] = (DASH_TITLES[tab] || DASH_TITLES.library)(firstName, contentFilter)

  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)')
    const onChange = (e) => {
      setIsMobile(e.matches)
      if (!e.matches) setDrawerOpen(false)
    }
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])
  useLockBodyScroll(drawerOpen && isMobile)

  // Escape closes the drawer, same as tapping outside it.
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e) => e.key === 'Escape' && setDrawerOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  const selectTab = (next, extras = {}) => {
    // A push, not a replace — each tab is somewhere the person went, and Back
    // should return them to the last one.
    const nextParams = { tab: next }
    if (extras.filter) nextParams.filter = extras.filter
    setParams(nextParams)
    setDrawerOpen(false)
    window.scrollTo({ top: 0 })
  }

  if (loading) {
    return (
      <div className="page" style={{ padding: 40 }}>
        <Skeleton rows={6} />
      </div>
    )
  }

  if (!authed) {
    return <Navigate to="/login" replace state={{ from: '/dashboard' }} />
  }

  return (
    <div className="page">
      <div className="dash">
        <Sidebar
          open={drawerOpen}
          activeTab={tab}
          activeFilter={contentFilter}
          onTab={selectTab}
          onClose={() => setDrawerOpen(false)}
        />

        <main className="dash-main">
          <div className="dash-top">
            <div className="dash-top-l">
              <button
                className="hamburger always"
                onClick={() => setDrawerOpen((o) => !o)}
                aria-label="Toggle menu"
                aria-expanded={drawerOpen}
              >
                <Menu size={22} />
              </button>
              {/* On mobile the sidebar is a drawer, so without this there is no
                  visible way back to the public site from the dashboard. */}
              <Link className="dash-home" to="/" aria-label="Back to MTONYO+ home">
                <Home size={19} />
              </Link>
              <div className="dash-titles">
                <h1>{title}</h1>
                <p>{subtitle}</p>
              </div>
            </div>

            <div className="dash-user">
              <NotificationBell />
              <div className="dash-avatar">
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" />
                ) : (
                  <span className="dash-initials">{initialsOf(user?.fullName || user?.email)}</span>
                )}
                <div className="dash-avatar-meta">
                  <b>{user?.fullName || user?.email || 'Your account'}</b>
                  <small>{accountSide === 'creator' ? 'Creator Account' : 'Viewer Account'}</small>
                </div>
              </div>
            </div>
          </div>

          <div className="dash-body">
            {denied ? (
              <EmptyState
                icon={ShieldAlert}
                title="You don't have access to this"
                message="That screen is for a different kind of account. Typing the address does not open it — the API refuses the same request."
                action={
                  <button className="btn btn-gold" type="button" onClick={() => selectTab(home)}>
                    Go to your dashboard
                  </button>
                }
              />
            ) : (
              <>
            {tab === 'overview' && <OverviewTab />}
            {tab === 'library' && <LibraryTab />}
            {tab === 'purchases' && <PurchasesTab />}
            {allowed.includes('upload') && (
              <div className={tab === 'upload' ? undefined : 'dash-tab-persist'} hidden={tab !== 'upload'}>
                <UploadTab />
              </div>
            )}
            {tab === 'videos' && (
              <MyVideosTab
                onNewUpload={() => selectTab('upload')}
                filter={contentFilter}
                onFilter={(f) => selectTab('videos', f ? { filter: f } : {})}
              />
            )}
            {tab === 'earnings' && <EarningsTab />}
            {tab === 'become' && <BecomeCreatorTab />}
            {tab === 'analytics' && <AnalyticsTab />}
            {tab === 'profile' && <ProfileTab />}
            {tab === 'settings' && <SettingsTab />}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

/** Two letters for an account with no picture, which is most of them. */
const initialsOf = (name = '') =>
  String(name)
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?'
