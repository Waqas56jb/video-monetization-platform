import { useMemo, useState } from 'react'
import { BellRing, CheckCheck, Inbox, Megaphone, ShieldAlert, UserCog } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import { Async } from '@/components/ui/States'
import { useNotifications } from '@/context/NotificationsContext'
import { useAuth } from '@/context/AuthContext'

/**
 * Everything the team has done, newest first.
 *
 * The requirement was that an administrator can read every operation performed
 * by every administrator and sub-admin. That is this screen: each entry names
 * the person, their email and their role, so an action is always traceable to a
 * human rather than to "an admin".
 */

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'staff_action', label: 'Team activity' },
  { key: 'announcement', label: 'Announcements' },
  { key: 'account', label: 'My account' },
]

const ICON = {
  staff_action: ShieldAlert,
  announcement: Megaphone,
  account: UserCog,
  system: BellRing,
}

const timeAgo = (iso) => {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return 'just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  if (secs < 604800) return `${Math.floor(secs / 86400)}d ago`
  return new Date(iso).toLocaleDateString()
}

export default function NotificationsTab() {
  const { items, unread, loading, error, reload, markAllRead, markRead } = useNotifications()
  const { isAdmin } = useAuth()
  const [filter, setFilter] = useState('all')

  const shown = useMemo(
    () => (filter === 'all' ? items : items.filter((n) => n.kind === filter)),
    [items, filter]
  )

  return (
    <div className="tab">
      <Panel
        title={`Notifications${unread ? ` · ${unread} unread` : ''}`}
        action={
          <button className="btn btn-ghost btn-sm" onClick={markAllRead} disabled={!unread}>
            <CheckCheck />
            Mark all read
          </button>
        }
      >
        <div className="chip-row">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`chip ${filter === f.key ? 'on' : ''}`.trim()}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <Async
          loading={loading && !items.length}
          error={error}
          onRetry={reload}
          empty={!shown.length}
          rows={6}
          emptyProps={{
            icon: Inbox,
            title: 'Nothing here yet',
            hint: isAdmin
              ? 'Approvals, rejections, blocks, removals and withdrawal decisions will appear here as your team makes them.'
              : 'Announcements and news about your account will appear here.',
          }}
        >
          <ul className="notif-list">
            {shown.map((n) => {
              const Ico = ICON[n.kind] || BellRing
              return (
                <li
                  key={n.id}
                  className={`notif ${n.read ? '' : 'unread'}`.trim()}
                  onClick={() => !n.read && markRead(n.id)}
                >
                  <span className={`notif-ico k-${n.kind}`}>
                    <Ico size={16} />
                  </span>
                  <div className="notif-body">
                    <b>{n.title}</b>
                    {n.body && <p>{n.body}</p>}
                    <div className="notif-meta">
                      {n.actor && (
                        <span className="notif-actor">
                          {n.actor.name || 'Unknown'}
                          <em>{n.actor.email}</em>
                          {n.actor.role && (
                            <span className={`pill ${n.actor.role === 'admin' ? 'ok' : 'warn'}`}>
                              {n.actor.role === 'admin' ? 'Admin' : 'Sub-admin'}
                            </span>
                          )}
                        </span>
                      )}
                      <time>{timeAgo(n.createdAt)}</time>
                    </div>
                  </div>
                  {!n.read && <span className="notif-dot" aria-label="unread" />}
                </li>
              )
            })}
          </ul>
        </Async>
      </Panel>
    </div>
  )
}
