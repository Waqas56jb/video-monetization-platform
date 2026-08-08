import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import api from '@/lib/api'
import { useAuth } from '@/context/AuthContext'

/**
 * The staff inbox.
 *
 * Every approval, rejection, block, removal and withdrawal decision made by
 * anyone on the team arrives here, naming who did it. For an administrator that
 * is the point of the thing: you find out a sub-admin published something
 * without having to think to go and check.
 *
 * It polls rather than holding a socket open — the volume is a handful of
 * events an hour, and a poll cannot fall silently out of sync the way a dropped
 * socket can. Polling stops while the tab is hidden so a laptop left open
 * overnight is not making a request a minute until morning.
 */

const NotificationsContext = createContext(null)
export const useNotifications = () => useContext(NotificationsContext)

const POLL_MS = 45000

export function NotificationsProvider({ children }) {
  const { authed } = useAuth()
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const timer = useRef(null)

  const load = useCallback(
    async ({ quiet = false } = {}) => {
      if (!authed) return
      if (!quiet) setLoading(true)
      try {
        const res = await api.staff.notifications({ limit: 60 })
        setItems(res.notifications || [])
        setUnread(res.unread || 0)
        setError(null)
      } catch (err) {
        setError(err.message)
      } finally {
        if (!quiet) setLoading(false)
      }
    },
    [authed]
  )

  useEffect(() => {
    if (!authed) {
      setItems([])
      setUnread(0)
      return
    }
    load()

    const tick = () => {
      if (document.visibilityState === 'visible') load({ quiet: true })
    }
    timer.current = setInterval(tick, POLL_MS)

    // Coming back to the tab should show current information immediately,
    // not whatever was true up to 45 seconds ago.
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(timer.current)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [authed, load])

  const markAllRead = useCallback(async () => {
    // Move the badge straight away — waiting on the round trip makes the click
    // feel broken. If it fails, the next poll puts the true count back.
    setUnread(0)
    setItems((list) => list.map((n) => ({ ...n, read: true })))
    try {
      const res = await api.staff.markRead()
      setUnread(res.unread ?? 0)
    } catch {
      load({ quiet: true })
    }
  }, [load])

  const markRead = useCallback(async (id) => {
    setItems((list) => list.map((n) => (n.id === id ? { ...n, read: true } : n)))
    setUnread((n) => Math.max(0, n - 1))
    try {
      await api.staff.markRead([id])
    } catch {
      /* the next poll corrects it */
    }
  }, [])

  const value = useMemo(
    () => ({ items, unread, loading, error, reload: load, markAllRead, markRead }),
    [items, unread, loading, error, load, markAllRead, markRead]
  )

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}
