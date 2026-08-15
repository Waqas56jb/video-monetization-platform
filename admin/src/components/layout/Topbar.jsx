import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, Megaphone, Menu, ShieldAlert, UserCog } from 'lucide-react'
import { useNotifications } from '@/context/NotificationsContext'
import { useAuth } from '@/context/AuthContext'

const ICON = { staff_action: ShieldAlert, announcement: Megaphone, account: UserCog }

const timeAgo = (iso) => {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return 'just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`
  return `${Math.floor(secs / 86400)}d`
}

export default function Topbar({ title, subtitle, onToggleDrawer, drawerOpen }) {
  const [open, setOpen] = useState(false)
  const { items, unread, markAllRead, markRead } = useNotifications()
  const { user, roleLabel } = useAuth()
  const navigate = useNavigate()
  const wrap = useRef(null)

  // Click anywhere else, or press Escape, and the panel closes — otherwise it
  // sits on top of whatever the admin is trying to read.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (wrap.current && !wrap.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const initials = (user?.fullName || user?.email || 'A')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join('')

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
        {/**
         * The global search box is gone.
         *
         * It held its value in state and did nothing with it — a box that
         * looked like search, accepted typing, and never searched anything. A
         * control room that lies about one control is not trusted about the
         * rest. Every screen that holds records has its own working search
         * (Videos, Users, Payments, Audit), and those are real.
         */}

        <div className="bell-wrap" ref={wrap}>
          <button
            className="bell"
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={unread ? `${unread} unread notifications` : 'Notifications'}
            aria-expanded={open}
          >
            <Bell size={20} strokeWidth={2} />
            {unread > 0 && <span className="bell-badge">{unread > 99 ? '99+' : unread}</span>}
          </button>

          {open && (
            <div className="notif-pop" role="dialog" aria-label="Notifications">
              <div className="notif-pop-head">
                <b>Notifications</b>
                <button onClick={markAllRead} disabled={!unread}>
                  <CheckCheck size={14} />
                  Mark all read
                </button>
              </div>

              {!items.length ? (
                <div className="notif-pop-empty">
                  <Bell size={22} />
                  <span>Nothing yet</span>
                  <small>Team activity and announcements land here.</small>
                </div>
              ) : (
                <ul className="notif-pop-list">
                  {items.slice(0, 12).map((n) => {
                    const Ico = ICON[n.kind] || Bell
                    return (
                      <li
                        key={n.id}
                        className={n.read ? '' : 'unread'}
                        onClick={() => {
                          if (!n.read) markRead(n.id)
                          setOpen(false)
                          navigate('/notifications')
                        }}
                      >
                        <span className={`notif-ico k-${n.kind}`}>
                          <Ico size={14} />
                        </span>
                        <div>
                          <b>{n.title}</b>
                          {n.actor && (
                            <small>
                              {n.actor.name} · {n.actor.email}
                            </small>
                          )}
                        </div>
                        <time>{timeAgo(n.createdAt)}</time>
                      </li>
                    )
                  })}
                </ul>
              )}

              <button
                className="notif-pop-all"
                onClick={() => {
                  setOpen(false)
                  navigate('/notifications')
                }}
              >
                See everything
              </button>
            </div>
          )}
        </div>

        <div className="admin-avatar">
          <span className="admin-initials">{initials}</span>
          <div className="admin-avatar-meta">
            <b>{user?.fullName || user?.email || 'Admin'}</b>
            <small>{roleLabel}</small>
          </div>
        </div>
      </div>
    </div>
  )
}
