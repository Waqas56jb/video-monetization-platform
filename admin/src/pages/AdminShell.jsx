import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from '@/components/layout/Sidebar'
import Topbar from '@/components/layout/Topbar'
import useLockBodyScroll from '@/hooks/useLockBodyScroll'
import useMediaQuery from '@/hooks/useMediaQuery'
import { NAV_GROUPS, PAGE_META } from '@/data/adminData'

const PATH_TO_TAB = Object.fromEntries(
  NAV_GROUPS.flatMap((g) => g.items).map((i) => [i.path, i.tab])
)

/** Sidebar + topbar frame; the active tab renders through <Outlet />. */
export default function AdminShell({ onLogout }) {
  const { pathname } = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const isDrawer = useMediaQuery('(max-width: 900px)')

  const tab = PATH_TO_TAB[pathname] || 'overview'
  const [title, subtitle] = PAGE_META[tab]

  // The drawer only overlays the page below 900px.
  useLockBodyScroll(drawerOpen && isDrawer)
  useEffect(() => {
    if (!isDrawer) setDrawerOpen(false)
  }, [isDrawer])

  // Original `tab()` jumped back to the top on every switch.
  useEffect(() => {
    setDrawerOpen(false)
    window.scrollTo({ top: 0 })
  }, [pathname])

  return (
    <div className="screen">
      <div className="shell">
        <Sidebar open={drawerOpen} onClose={() => setDrawerOpen(false)} onLogout={onLogout} />

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
