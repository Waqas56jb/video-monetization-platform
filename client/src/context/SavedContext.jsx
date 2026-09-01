import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import api from '@/lib/api'
import { useAuth } from '@/context/AuthContext'

/**
 * What this viewer has saved, held once for the whole app.
 *
 * The same reasoning as [FollowContext]: a Save control on every card is one
 * question per tile — eight on Home, more on Explore — against a limiter of 120
 * requests a minute that a checkout also has to fit inside. So the set is
 * fetched once, as ids, and every control reads from it.
 *
 * The toggle is optimistic and puts the flip back if the server refuses, for
 * the same reason: waiting a round trip with nothing but a disabled button to
 * show for it is the unresponsiveness the client reported.
 */
const SavedContext = createContext({
  isSaved: () => false,
  toggle: async () => {},
  pending: () => false,
  ready: false,
  seed: () => {},
})

export function useSaved() {
  return useContext(SavedContext)
}

export function SavedProvider({ children }) {
  const { authed, user } = useAuth()
  const [ids, setIds] = useState(() => new Set())
  const [busy, setBusy] = useState(() => new Set())
  const [ready, setReady] = useState(false)
  const inFlight = useRef(new Set())

  useEffect(() => {
    let alive = true
    if (!authed) {
      setIds(new Set())
      setReady(true)
      return () => { alive = false }
    }
    setReady(false)
    api.library
      .saved()
      .then((res) => {
        if (!alive) return
        setIds(new Set(res?.videoIds || []))
        setReady(true)
      })
      .catch(() => {
        // A viewer whose list failed to load still gets a working button; it
        // starts from "not saved", and the server decides on the first press.
        if (alive) setReady(true)
      })
    return () => { alive = false }
  }, [authed, user?.id])

  const isSaved = useCallback((videoId) => Boolean(videoId) && ids.has(videoId), [ids])
  const pending = useCallback((videoId) => busy.has(videoId), [busy])

  /** Adopt a set the library page has already fetched, rather than asking again. */
  const seed = useCallback((videoIds) => {
    if (!Array.isArray(videoIds)) return
    setIds(new Set(videoIds))
    setReady(true)
  }, [])

  const toggle = useCallback(
    async (videoId) => {
      if (!videoId || inFlight.current.has(videoId)) return
      const wasSaved = ids.has(videoId)
      inFlight.current.add(videoId)
      setBusy((was) => new Set(was).add(videoId))
      setIds((was) => {
        const next = new Set(was)
        if (wasSaved) next.delete(videoId)
        else next.add(videoId)
        return next
      })
      try {
        const res = wasSaved ? await api.library.unsave(videoId) : await api.library.save(videoId)
        setIds((was) => {
          const next = new Set(was)
          if (res?.saved) next.add(videoId)
          else next.delete(videoId)
          return next
        })
        return res
      } catch (err) {
        setIds((was) => {
          const next = new Set(was)
          if (wasSaved) next.add(videoId)
          else next.delete(videoId)
          return next
        })
        throw err
      } finally {
        inFlight.current.delete(videoId)
        setBusy((was) => {
          const next = new Set(was)
          next.delete(videoId)
          return next
        })
      }
    },
    [ids]
  )

  const value = useMemo(
    () => ({ isSaved, toggle, pending, seed, ready }),
    [isSaved, toggle, pending, seed, ready]
  )

  return <SavedContext.Provider value={value}>{children}</SavedContext.Provider>
}
