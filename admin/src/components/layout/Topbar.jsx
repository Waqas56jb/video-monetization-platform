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
      <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
        <button
          className="hamburger"
          onClick={onToggleDrawer}
          aria-label="Toggle menu"
          aria-expanded={drawerOpen}
        >
          <Menu />
        </button>
        <div>
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
        <button className="bell" onClick={() => showToast('4 items need your review')} aria-label="Notifications">
          <Bell />
        </button>
        <div className="admin-avatar">
          <img src={IMG.admin} alt="" />
          <div>
            <b>Admin</b>
            <small>SUPER ADMIN</small>
          </div>
        </div>
      </div>
    </div>
  )
}
