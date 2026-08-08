import { Fragment } from 'react'
import { NavLink } from 'react-router-dom'
import { LogOut, Play } from 'lucide-react'
import Icon from '@/components/ui/Icon'
import { NAV_GROUPS } from '@/data/adminData'

export default function Sidebar({ open, onClose, onLogout }) {
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
            Mtonyo<span className="logo-plus">+</span>
          </span>
        </div>
        <span className="admin-tag">SUPER ADMIN</span>

        {NAV_GROUPS.map((group) => (
          <Fragment key={group.label}>
            <div className="side-label">{group.label}</div>
            {group.items.map((item) => (
              <NavLink
                key={item.tab}
                to={item.path}
                className={({ isActive }) => `side-link ${isActive ? 'on' : ''}`.trim()}
                onClick={onClose}
              >
                <Icon name={item.icon} />
                {item.label}
                {item.count != null && <span className="count">{item.count}</span>}
              </NavLink>
            ))}
          </Fragment>
        ))}

        <div className="side-foot">
          <button className="side-link" onClick={onLogout}>
            <LogOut />
            Log out
          </button>
        </div>
      </aside>
    </>
  )
}
