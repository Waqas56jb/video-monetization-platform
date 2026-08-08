import { useEffect, useState } from 'react'
import { Bell, Menu } from 'lucide-react'
import Sidebar from '@/components/dashboard/Sidebar'
import OverviewTab from '@/components/dashboard/tabs/OverviewTab'
import LibraryTab from '@/components/dashboard/tabs/LibraryTab'
import UploadTab from '@/components/dashboard/tabs/UploadTab'
import MyVideosTab from '@/components/dashboard/tabs/MyVideosTab'
import EarningsTab from '@/components/dashboard/tabs/EarningsTab'
import PurchasesTab from '@/components/dashboard/tabs/PurchasesTab'
import BecomeCreatorTab from '@/components/dashboard/tabs/BecomeCreatorTab'
import useLockBodyScroll from '@/hooks/useLockBodyScroll'
import { DASH_TITLES, IMG } from '@/data/content'
import { useToast } from '@/context/ToastContext'
import { useRole } from '@/context/RoleContext'

/** Which tabs each role is allowed to open. */
const TABS_BY_ROLE = {
  viewer: ['library', 'purchases', 'become'],
  creator: ['overview', 'library', 'purchases', 'upload', 'videos', 'earnings'],
}

/** Where each role lands when it opens the dashboard. */
const HOME_TAB = { viewer: 'library', creator: 'overview' }

export default function Dashboard() {
  const { role, isCreator } = useRole()
  const [tab, setTab] = useState(() => HOME_TAB[role])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const showToast = useToast()

  // A role change (viewer upgrading to creator, or logging in as the other
  // role) must never leave the user staring at a tab they can no longer open.
  useEffect(() => {
    if (!TABS_BY_ROLE[role].includes(tab)) setTab(HOME_TAB[role])
  }, [role, tab])

  const [title, subtitle] = DASH_TITLES[tab] || DASH_TITLES.library

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

  const selectTab = (next) => {
    setTab(next)
    setDrawerOpen(false)
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="page">
      <div className="dash">
        <Sidebar
          open={drawerOpen}
          activeTab={tab}
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
              <div className="dash-titles">
                <h1>{title}</h1>
                <p>{subtitle}</p>
              </div>
            </div>

            <div className="dash-user">
              <button
                className="bell"
                type="button"
                onClick={() => showToast('No new notifications')}
                aria-label="Notifications"
              >
                <Bell size={20} strokeWidth={2} />
              </button>
              <div className="dash-avatar">
                <img src={IMG.avatarKonde} alt="" />
                <div className="dash-avatar-meta">
                  <b>Juma Hassan</b>
                  <small>{isCreator ? 'Creator Account' : 'Viewer Account'}</small>
                </div>
              </div>
            </div>
          </div>

          <div className="dash-body">
            {tab === 'overview' && <OverviewTab />}
            {tab === 'library' && <LibraryTab />}
            {tab === 'purchases' && <PurchasesTab />}
            {tab === 'upload' && <UploadTab />}
            {tab === 'videos' && <MyVideosTab onNewUpload={() => selectTab('upload')} />}
            {tab === 'earnings' && <EarningsTab />}
            {tab === 'become' && <BecomeCreatorTab onUpgraded={() => selectTab('overview')} />}
          </div>
        </main>
      </div>
    </div>
  )
}
