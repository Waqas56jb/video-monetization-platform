import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import api, { saveSession, clearSession, getAccessToken, onSessionExpired } from '@/lib/api'

/**
 * Who is signed into the control centre.
 *
 * The role comes from the profile on every load, never from anything the
 * browser is holding. That matters: if an administrator suspends a sub-admin,
 * it takes effect on their very next page load rather than whenever they happen
 * to clear their storage.
 *
 * Only staff belong here. A viewer or creator with a perfectly valid session is
 * still turned away — this app is not for them.
 */

const AuthContext = createContext(null)

export const useAuth = () => useContext(AuthContext)

const STAFF = ['admin', 'sub_admin']

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(Boolean(getAccessToken()))
  const [error, setError] = useState(null)

  /* -------- restore an existing session on first load -------- */
  useEffect(() => {
    if (!getAccessToken()) {
      setLoading(false)
      return
    }
    let alive = true
    api.auth
      .me()
      .then((res) => {
        if (!alive) return
        if (!STAFF.includes(res?.user?.role)) {
          clearSession()
          setUser(null)
        } else {
          setUser(res.user)
        }
      })
      .catch(() => {
        clearSession()
        if (alive) setUser(null)
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  /* -------- a session that dies mid-use ends the session here too -------- */
  useEffect(() => onSessionExpired(() => setUser(null)), [])

  const login = useCallback(async ({ email, password }) => {
    setError(null)
    const res = await api.auth.login({ email, password })

    if (!STAFF.includes(res?.user?.role)) {
      // Their credentials were right, but this is not their door. Say so
      // plainly rather than showing a puzzling "wrong password".
      clearSession()
      const err = new Error('This account does not have access to the control centre.')
      err.status = 403
      throw err
    }

    saveSession(res.session)
    setUser(res.user)
    return res.user
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.auth.logout()
    } catch {
      /* the session is going away regardless */
    }
    clearSession()
    setUser(null)
  }, [])

  /** Refresh the signed-in profile after changing an email or a name. */
  const reload = useCallback(async () => {
    const res = await api.auth.me()
    setUser(res.user)
    return res.user
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      error,
      setError,
      login,
      logout,
      reload,
      authed: Boolean(user),
      isAdmin: user?.role === 'admin',
      isSubAdmin: user?.role === 'sub_admin',
      /** Account management is the administrator's alone. */
      canManageAccounts: user?.role === 'admin',
      roleLabel: user?.role === 'sub_admin' ? 'SUB ADMIN' : 'SUPER ADMIN',
    }),
    [user, loading, error, login, logout, reload]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
