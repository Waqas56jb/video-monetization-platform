import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import api from '@/lib/api'
import { useAuth } from '@/context/AuthContext'

/**
 * Who this viewer follows, held once for the whole app.
 *
 * A Follow control on the watch page is one question. A Follow control on every
 * card is eight questions on Home, more on Explore, and more again as a grid
 * pages in — against a limiter of 120 requests a minute that a checkout also has
 * to fit inside. So the set is fetched once, as ids, and every control reads
 * from it.
 *
 * OPTIMISTIC, AND HONEST ABOUT IT. The button flips the moment it is pressed,
 * because waiting a round trip with nothing but `disabled` to show for it is the
 * unresponsiveness the client reported. If the request then fails the flip is
 * undone and the error surfaces — an optimistic UI that quietly keeps a state
 * the server rejected is worse than no optimism at all.
 *
 * The count comes back from the server on success and replaces the guess, so a
 * follow that raced another device settles on the truth rather than on this
 * tab's arithmetic.
 */
const FollowContext = createContext({
  isFollowing: () => false,
  countFor: () => null,
  toggle: async () => {},
  pending: () => false,
  ready: false,
})

export function useFollow() {
  return useContext(FollowContext)
}

export function FollowProvider({ children }) {
  const { authed, user } = useAuth()
  const [ids, setIds] = useState(() => new Set())
  const [counts, setCounts] = useState(() => ({}))
  const [busy, setBusy] = useState(() => new Set())
  const [ready, setReady] = useState(false)
  /* One in flight per creator. Two taps on the same button must not send two
     opposite requests whose order decides the outcome. */
  const inFlight = useRef(new Set())

  useEffect(() => {
    let alive = true
    if (!authed) {
      setIds(new Set())
      setReady(true)
      return () => { alive = false }
    }
    setReady(false)
    api.creators
      .following()
      .then((res) => {
        if (!alive) return
        setIds(new Set(res?.creatorIds || []))
        setReady(true)
      })
      .catch(() => {
        // A signed-in viewer whose follow list failed to load still gets a
        // working button; it just starts from "not following", and the server
        // is the one that decides on the first press either way.
        if (alive) setReady(true)
      })
    return () => { alive = false }
  }, [authed, user?.id])

  const isFollowing = useCallback((creatorId) => Boolean(creatorId) && ids.has(creatorId), [ids])
  const countFor = useCallback((creatorId) => counts[creatorId] ?? null, [counts])
  const pending = useCallback((creatorId) => busy.has(creatorId), [busy])

  const toggle = useCallback(
    async (creatorId, { onError } = {}) => {
      if (!creatorId || inFlight.current.has(creatorId)) return
      const wasFollowing = ids.has(creatorId)
      inFlight.current.add(creatorId)
      setBusy((was) => new Set(was).add(creatorId))
      setIds((was) => {
        const next = new Set(was)
        if (wasFollowing) next.delete(creatorId)
        else next.add(creatorId)
        return next
      })
      setCounts((was) => {
        const known = was[creatorId]
        if (known == null) return was
        return { ...was, [creatorId]: Math.max(0, known + (wasFollowing ? -1 : 1)) }
      })
      try {
        const res = wasFollowing
          ? await api.creators.unfollow(creatorId)
          : await api.creators.follow(creatorId)
        setIds((was) => {
          const next = new Set(was)
          if (res?.isFollowing) next.add(creatorId)
          else next.delete(creatorId)
          return next
        })
        if (typeof res?.followers === 'number') {
          setCounts((was) => ({ ...was, [creatorId]: res.followers }))
        }
        return res
      } catch (err) {
        setIds((was) => {
          const next = new Set(was)
          if (wasFollowing) next.add(creatorId)
          else next.delete(creatorId)
          return next
        })
        setCounts((was) => {
          const known = was[creatorId]
          if (known == null) return was
          return { ...was, [creatorId]: Math.max(0, known + (wasFollowing ? 1 : -1)) }
        })
        onError?.(err)
        throw err
      } finally {
        inFlight.current.delete(creatorId)
        setBusy((was) => {
          const next = new Set(was)
          next.delete(creatorId)
          return next
        })
      }
    },
    [ids]
  )

  /** Seed a count a page already knows, so the button can show it without asking. */
  const seedCount = useCallback((creatorId, followers, following) => {
    if (!creatorId) return
    if (typeof followers === 'number') {
      setCounts((was) => (was[creatorId] === followers ? was : { ...was, [creatorId]: followers }))
    }
    if (typeof following === 'boolean') {
      setIds((was) => {
        if (was.has(creatorId) === following) return was
        const next = new Set(was)
        if (following) next.add(creatorId)
        else next.delete(creatorId)
        return next
      })
    }
  }, [])

  const value = useMemo(
    () => ({ isFollowing, countFor, toggle, pending, seedCount, ready }),
    [isFollowing, countFor, toggle, pending, seedCount, ready]
  )

  return <FollowContext.Provider value={value}>{children}</FollowContext.Provider>
}
