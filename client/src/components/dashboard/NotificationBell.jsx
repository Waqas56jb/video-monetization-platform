import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, CheckCheck, Megaphone, ShieldCheck, UserCog } from 'lucide-react'
import api from '@/lib/api'
import { timeAgo } from '@/hooks/useApi'

/**
 * The viewer's and creator's inbox.
 *
 * This is where "your video was approved", "your withdrawal was paid" and
 * anything the team announces actually lands. Before this existed those
 * notifications were written to the database and then seen by nobody outside
 * the admin panel — the creator waiting to hear about their upload had no way
 * to find out.
 *
 * Polls rather than holding a socket open: it is a handful of events a day,
 * and a poll cannot fall silently out of sync the way a dropped socket can.
 * It stops while the tab is hidden so a phone left open overnight is not
 * making a request a minute until morning.
 */
const POLL_MS = 60000

const ICON = { announcement: Megaphone, account: UserCog, staff_action: ShieldCheck }

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(true)
  const wrap = useRef(null)

  const load = useCallback(async () => {
    try {
      const res = await api.inbox.list({ limit: 25 })
      setItems(res.notifications || [])
      setUnread(res.unread || 0)
    } catch {
      /* a quiet failure here must not break the dashboard */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const tick = () => document.visibilityState === 'visible' && load()
    const id = setInterval(tick, POLL_MS)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [load])

  // Click elsewhere or press Escape and it closes, like any menu.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => wrap.current && !wrap.current.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const markAll = async () => {
    // Move the badge immediately — waiting on the round trip makes the click
    // feel broken. The next poll corrects it if the call failed.
    setUnread(0)
    setItems((list) => list.map((n) => ({ ...n, read: true })))
    try {
      await api.inbox.markRead()
    } catch {
      load()
    }
  }

  return (
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
            <button onClick={markAll} disabled={!unread}>
              <CheckCheck size={14} />
              Mark all read
            </button>
          </div>

          {loading ? (
            <div className="notif-pop-empty">
              <span>Loading…</span>
            </div>
          ) : !items.length ? (
            <div className="notif-pop-empty">
              <Bell size={22} />
              <span>Nothing yet</span>
              <small>News about your account and announcements land here.</small>
            </div>
          ) : (
            <ul className="notif-pop-list">
              {items.map((n) => {
                const Ico = ICON[n.kind] || Bell
                return (
                  <li key={n.id} className={n.read ? '' : 'unread'}>
                    <span className={`notif-ico k-${n.kind}`}>
                      <Ico size={14} />
                    </span>
                    <div>
                      <b>{n.title}</b>
                      {n.body && <small>{n.body}</small>}
                    </div>
                    <time>{timeAgo(n.createdAt)}</time>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
