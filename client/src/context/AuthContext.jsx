import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api, { saveSession, clearSession, getAccessToken, onSessionExpired } from '@/lib/api'
import { useToast } from '@/context/ToastContext'
import { authUrl } from '@/lib/nextPath'

/**
 * The real signed-in user, from the backend.
 *
 * There is no client-side role flag any more: the role comes from the
 * `profiles` row and is re-read on every page load, so blocking someone or
 * changing their role takes effect immediately rather than after they clear
 * their browser.
 */
const AuthContext = createContext(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** Kept so existing components can ask "is this a creator?" unchanged. */
/**
 * The older name for the same thing, kept so existing screens keep working.
 *
 * It now spreads the whole context rather than picking four fields out of it.
 * The picked version silently returned `undefined` for anything it had not
 * thought of — which is exactly how the Log out button came to do nothing at
 * all: it destructured `signOut` from here, got undefined, and threw on click
 * where nobody was looking.
 */
export function useRole() {
  const ctx = useAuth()
  return {
    ...ctx,
    role: ctx.user?.role || 'viewer',
    authed: Boolean(ctx.user),
    isCreator: ctx.user?.role === 'creator' || ctx.user?.role === 'admin',
    isAdmin: ctx.user?.role === 'admin',
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [creator, setCreator] = useState(null)
  const [loading, setLoading] = useState(Boolean(getAccessToken()))
  const navigate = useNavigate()
  const showToast = useToast()

  /** Re-read the profile from the server. */
  const reload = useCallback(async () => {
    if (!getAccessToken()) {
      setUser(null)
      setCreator(null)
      setLoading(false)
      return null
    }
    try {
      const data = await api.auth.me()
      setUser(data.user)
      setCreator(data.creator || null)
      return data.user
    } catch (err) {
      /**
       * Only a 401 that actually cleared the current token means the session
       * is dead. A late 401 from a request that started before this login
       * must not wipe a user we just set — that was the first-attempt failure.
       */
      if (err?.status === 401 && !getAccessToken()) {
        setUser(null)
        setCreator(null)
      }
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  // A refresh token that stops working must not leave a stale user on screen.
  useEffect(
    () =>
      onSessionExpired(() => {
        setUser(null)
        setCreator(null)
        const here = `${window.location.pathname}${window.location.search}`
        if (here.startsWith('/login') || here.startsWith('/signup')) return
        showToast('Your session ended. Sign in again to continue.')
        navigate(authUrl('login', here, { reason: 'expired' }))
      }),
    [navigate, showToast]
  )

  const signIn = useCallback(async ({ email, password }) => {
    setLoading(true)
    try {
      const data = await api.auth.login({
        email: String(email || '').trim().toLowerCase(),
        password,
      })
      saveSession(data.session)
      setUser(data.user)
      try {
        await reload()
      } catch {
        /* Session is already saved. A profile reload can wait. */
      }
      return data.user
    } finally {
      setLoading(false)
    }
  }, [reload])

  const signUp = useCallback(async ({ email, password, fullName, phone, role }) => {
    const data = await api.auth.register({ email, password, fullName, phone, role })
    if (data.session) {
      saveSession(data.session)
      setUser(data.user)
      await reload()
    }
    return data
  }, [reload])

  const signOut = useCallback(async () => {
    try {
      await api.auth.logout()
    } catch {
      /* the token may already be gone; sign out locally regardless */
    }
    clearSession()
    setUser(null)
    setCreator(null)
  }, [])

  const becomeCreator = useCallback(async () => {
    const data = await api.auth.becomeCreator()
    setUser(data.user)
    await reload()
    return data.user
  }, [reload])

  const updateProfile = useCallback(async (patch) => {
    const data = await api.auth.updateProfile(patch)
    setUser(data.user)
    return data.user
  }, [])

  const value = useMemo(
    () => ({
      user,
      creator,
      loading,
      authed: Boolean(user),
      role: user?.role || 'viewer',
      isCreator: user?.role === 'creator' || user?.role === 'admin',
      isAdmin: user?.role === 'admin',
      signIn,
      signUp,
      signOut,
      becomeCreator,
      updateProfile,
      reload,
    }),
    [user, creator, loading, signIn, signUp, signOut, becomeCreator, updateProfile, reload]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
