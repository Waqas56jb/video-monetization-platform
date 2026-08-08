import { useEffect, useState } from 'react'
import { Bell, Menu } from 'lucide-react'
import Sidebar from '@/components/dashboard/Sidebar'
import OverviewTab from '@/components/dashboard/tabs/OverviewTab'
import LibraryTab from '@/components/dashboard/tabs/LibraryTab'
import UploadTab from '@/components/dashboard/tabs/UploadTab'
import MyVideosTab from '@/components/dashboard/tabs/MyVideosTab'
import EarningsTab from '@/components/dashboard/tabs/EarningsTab'
import useLockBodyScroll from '@/hooks/useLockBodyScroll'
import { DASH_TITLES, IMG } from '@/data/content'
import { useToast } from '@/context/ToastContext'

export default function Dashboard() {
  const [tab, setTab] = useState('overview')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const showToast = useToast()
  const [title, subtitle] = DASH_TITLES[tab]

  // Only lock scrolling while the mobile drawer is actually covering the page.
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
                  <small>Creator Account</small>
                </div>
              </div>
            </div>
          </div>

          <div className="dash-body">
            {tab === 'overview' && <OverviewTab />}
            {tab === 'library' && <LibraryTab />}
            {tab === 'upload' && <UploadTab />}
            {tab === 'videos' && <MyVideosTab onNewUpload={() => selectTab('upload')} />}
            {tab === 'earnings' && <EarningsTab />}
          </div>
        </main>
      </div>
    </div>
  )
}
