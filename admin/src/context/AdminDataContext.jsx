import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import useCollection from '@/hooks/useCollection'
import {
  CREATORS,
  DELETION_REQUESTS,
  FEED_POOL,
  FLAGGED_CONTENT,
  INITIAL_FEED,
  OVERVIEW_WITHDRAWALS,
  REVIEW_QUEUE,
  USERS,
  VIDEOS,
  WITHDRAWAL_QUEUE,
} from '@/data/adminData'

const AdminDataContext = createContext(null)

export function useAdminData() {
  return useContext(AdminDataContext)
}

const FEED_INTERVAL = 5000 // original: new activity item every 5s
const FEED_MAX = 8 // original: trim the feed once it passes 8 items

/**
 * Holds every collection the admin can mutate, so a row blocked on the Users
 * tab is still blocked after navigating away and back — exactly like the
 * original, where all tabs lived in one DOM.
 */
export function AdminDataProvider({ children }) {
  const users = useCollection(USERS)
  const creators = useCollection(CREATORS)
  const videos = useCollection(VIDEOS)
  const withdrawals = useCollection(WITHDRAWAL_QUEUE)
  const overviewWithdrawals = useCollection(OVERVIEW_WITHDRAWALS)
  const deletionRequests = useCollection(DELETION_REQUESTS)
  const flagged = useCollection(FLAGGED_CONTENT)
  const reviewQueue = useCollection(REVIEW_QUEUE)

  /* ---------- live activity feed ---------- */
  const [feed, setFeed] = useState(INITIAL_FEED)
  const [feedRunning, setFeedRunning] = useState(false)
  const feedIndex = useRef(0)
  const feedSeq = useRef(0)

  const startFeed = useCallback(() => setFeedRunning(true), [])
  const stopFeed = useCallback(() => setFeedRunning(false), [])

  useEffect(() => {
    if (!feedRunning) return
    const id = setInterval(() => {
      const [tone, icon, html] = FEED_POOL[feedIndex.current++ % FEED_POOL.length]
      const item = { id: `fd-live-${feedSeq.current++}`, tone, icon, html, time: 'just now', fresh: true }
      setFeed((list) => [item, ...list].slice(0, FEED_MAX))
    }, FEED_INTERVAL)
    return () => clearInterval(id)
  }, [feedRunning])

  const value = {
    users,
    creators,
    videos,
    withdrawals,
    overviewWithdrawals,
    deletionRequests,
    flagged,
    reviewQueue,
    feed,
    startFeed,
    stopFeed,
  }

  return <AdminDataContext.Provider value={value}>{children}</AdminDataContext.Provider>
}
