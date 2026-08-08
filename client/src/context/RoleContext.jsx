import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getItem, setItem } from '@/lib/safeStorage'

/**
 * Who is using the app, and whether they are signed in.
 *
 * A viewer watches and buys; a creator also uploads, prices and earns. One
 * account can do both — a viewer can upgrade — so this is a single role flag
 * rather than two account types.
 *
 * `authed` exists so the public chrome can adapt: a signed-in creator browsing
 * /explore must not be shown "Log in / Start Creating" with no route back to
 * their dashboard.
 *
 * V1 keeps both in localStorage so testing on a phone survives a refresh. When
 * Supabase auth lands, this reads them off the session instead and the rest of
 * the UI keeps working unchanged.
 */
const RoleContext = createContext(null)

const ROLE_KEY = 'mtonyo.role'
const AUTH_KEY = 'mtonyo.authed'
const VALID = ['viewer', 'creator']

export function useRole() {
  return useContext(RoleContext)
}

export function RoleProvider({ children }) {
  const [role, setRoleState] = useState(() => {
    if (typeof window === 'undefined') return 'viewer'
    const saved = getItem(ROLE_KEY)
    return VALID.includes(saved) ? saved : 'viewer'
  })

  const [authed, setAuthed] = useState(() => {
    if (typeof window === 'undefined') return false
    return getItem(AUTH_KEY) === '1'
  })

  // Losing storage (Safari private mode) simply means these don't survive a
  // refresh — never a crash.
  useEffect(() => {
    setItem(ROLE_KEY, role)
  }, [role])

  useEffect(() => {
    setItem(AUTH_KEY, authed ? '1' : '0')
  }, [authed])

  const setRole = useCallback((next) => {
    if (VALID.includes(next)) setRoleState(next)
  }, [])

  const signIn = useCallback(
    (next) => {
      if (VALID.includes(next)) setRoleState(next)
      setAuthed(true)
    },
    []
  )

  const signOut = useCallback(() => setAuthed(false), [])

  const value = useMemo(
    () => ({ role, setRole, authed, signIn, signOut, isCreator: role === 'creator' }),
    [role, setRole, authed, signIn, signOut]
  )

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>
}
