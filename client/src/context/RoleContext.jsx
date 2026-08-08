import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getItem, setItem } from '@/lib/safeStorage'

/**
 * Who is signed in: a viewer (watches and buys) or a creator (also uploads,
 * prices and earns). One account can do both — a viewer can upgrade — which is
 * why this is a single role flag rather than two separate account types.
 *
 * V1 keeps it in localStorage so testing on a phone survives a refresh. When
 * Supabase auth lands, this reads the role off the session instead and the rest
 * of the UI keeps working unchanged.
 */
const RoleContext = createContext(null)

const KEY = 'mtonyo.role'
const VALID = ['viewer', 'creator']

export function useRole() {
  return useContext(RoleContext)
}

export function RoleProvider({ children }) {
  const [role, setRoleState] = useState(() => {
    if (typeof window === 'undefined') return 'viewer'
    const saved = getItem(KEY)
    return VALID.includes(saved) ? saved : 'viewer'
  })

  // Private mode simply means the role won't survive a refresh — never a crash.
  useEffect(() => {
    setItem(KEY, role)
  }, [role])

  const setRole = useCallback((next) => {
    if (VALID.includes(next)) setRoleState(next)
  }, [])

  const value = useMemo(
    () => ({ role, setRole, isCreator: role === 'creator' }),
    [role, setRole]
  )

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>
}
