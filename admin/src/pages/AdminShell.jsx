import { useCallback, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from '@/components/layout/Sidebar'
import Topbar from '@/components/layout/Topbar'
import useLockBodyScroll from '@/hooks/useLockBodyScroll'
import useMediaQuery from '@/hooks/useMediaQuery'
import api from '@/lib/api'

/**
 * Page titles live here rather than in a data file, because every one of these
 * routes is now backed by a real endpoint and the two lists have to agree.
 */
const PAGE_META = {
  '/dashboard': ['Dashboard', 'Platform overview · live data'],
  '/analytics': ['Analytics', 'Performance across the platform'],
  '/notifications': ['Notifications', 'Everything your team has done'],
  '/users': ['User Management', 'View, block or restore any account'],
  '/creators': ['Creator Management', 'Verify creators and set their revenue split'],
  '/creator-applications': ['Creator Applications', 'Approve, decline, suspend or revoke who publishes on MTONYO+'],
  '/videos': ['Video Library', 'Every video on the platform'],
  '/review': ['Content Review', 'Nothing goes live until it passes through here'],
  '/moderation': ['Moderation', 'Reports and removal requests'],
  '/announcements': ['Announcements', 'Talk to viewers, creators or the team'],
  '/payments': ['Payments', 'Every transaction, as it happens'],
  '/withdrawals': ['Withdrawals', 'Creator payout requests'],
  '/revenue': ['Revenue & Splits', 'What the platform keeps, and what creators earn'],
  '/ads': ['Ads Management', 'Campaigns on Free + Ads videos'],
  '/audit': ['Audit Log', 'Every action, permanently recorded'],
  '/settings': ['Settings', 'Your account, the platform, and the team'],
}

/** Sidebar + topbar frame; the active tab renders through <Outlet />. */
export default function AdminShell({ onLogout }) {
  const { pathname } = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const isDrawer = useMediaQuery('(max-width: 900px)')
  const [counts, setCounts] = useState({})

  const [title, subtitle] = PAGE_META[pathname] || ['Dashboard', 'Platform overview · live data']

  /**
   * The queue badges are real counts from the server, refreshed when the route
   * changes. A badge that says 3 when the queue is empty is worse than no badge.
   */
  const loadCounts = useCallback(async () => {
    try {
      const res = await api.admin.overview()
      setCounts({
        review: res.queues?.pendingReview ?? 0,
        withdrawals: res.queues?.pendingWithdrawals ?? 0,
        moderation: (res.queues?.openReports ?? 0) + (res.queues?.pendingDeletions ?? 0),
        applications: res.queues?.pendingApplications ?? 0,
      })
    } catch {
      setCounts({}) // a failed count simply shows no badge
    }
  }, [])

  useEffect(() => {
    loadCounts()
  }, [pathname, loadCounts])

  // The drawer only overlays the page below 900px.
  useLockBodyScroll(drawerOpen && isDrawer)
  useEffect(() => {
    if (!isDrawer) setDrawerOpen(false)
  }, [isDrawer])

  useEffect(() => {
    setDrawerOpen(false)
    window.scrollTo({ top: 0 })
  }, [pathname])

  return (
    <div className="screen">
      <div className="shell">
        <Sidebar
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          onLogout={onLogout}
          counts={counts}
        />

        <main className="main">
          <Topbar
            title={title}
            subtitle={subtitle}
            drawerOpen={drawerOpen}
            onToggleDrawer={() => setDrawerOpen((o) => !o)}
          />
          <Outlet />
        </main>
      </div>
    </div>
  )
}
