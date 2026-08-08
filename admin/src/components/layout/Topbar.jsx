import { useState } from 'react'
import { Bell, Menu } from 'lucide-react'
import { SearchBar } from '@/components/ui/Filters'
import { IMG } from '@/data/adminData'
import { useToast } from '@/context/ToastContext'

export default function Topbar({ title, subtitle, onToggleDrawer, drawerOpen }) {
  const [query, setQuery] = useState('')
  const showToast = useToast()

  return (
    <div className="topbar">
      <div className="top-l">
        <button
          className="hamburger"
          type="button"
          onClick={onToggleDrawer}
          aria-label="Toggle menu"
          aria-expanded={drawerOpen}
        >
          <Menu size={22} />
        </button>
        <div className="top-titles">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </div>

      <div className="top-r">
        <SearchBar
          value={query}
          onChange={setQuery}
          placeholder="Search anything…"
          ariaLabel="Global search"
        />
        <button
          className="bell"
          type="button"
          onClick={() => showToast('4 items need your review')}
          aria-label="Notifications"
        >
          <Bell size={20} strokeWidth={2} />
        </button>
        <div className="admin-avatar">
          <img src={IMG.admin} alt="" />
          <div className="admin-avatar-meta">
            <b>Admin</b>
            <small>SUPER ADMIN</small>
          </div>
        </div>
      </div>
    </div>
  )
}
