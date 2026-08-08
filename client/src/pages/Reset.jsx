import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, RefreshCcw, ShieldCheck, AlertTriangle } from 'lucide-react'
import AuthLayout from '@/components/auth/AuthLayout'
import { PasswordField } from '@/components/ui/Field'
import api from '@/lib/api'
import { useToast } from '@/context/ToastContext'

/**
 * Step 2 of a password reset: set the new password.
 *
 * Supabase sends the user here with recovery tokens in the URL fragment
 * (#access_token=…&type=recovery). Possession of that link is the proof of
 * identity — there is no code to type and no second factor.
 */
function readRecoveryTokens() {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : ''
  const params = new URLSearchParams(hash || window.location.search)
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  const type = params.get('type')
  const error = params.get('error_description') || params.get('error')
  if (error) return { error }
  if (!accessToken || !refreshToken) return null
  return { accessToken, refreshToken, type }
}

export default function Reset() {
  const navigate = useNavigate()
  const showToast = useToast()

  const [tokens, setTokens] = useState(undefined) // undefined = still reading
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const found = readRecoveryTokens()
    setTokens(found)
    // Clear the tokens from the address bar so they are not left in history.
    if (found?.accessToken) {
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  const onSubmit = async (e) => {
    e.preventDefault()
    if (password !== confirm) return setError('The two passwords do not match')
    if (password.length < 8) return setError('Password must be at least 8 characters')

    setBusy(true)
    setError(null)
    try {
      await api.auth.resetPassword({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        password,
      })
      setDone(true)
      showToast('Password updated — sign in with your new password')
      setTimeout(() => navigate('/login', { replace: true }), 1600)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const side = {
    badge: (
      <>
        <ShieldCheck style={{ width: 14, height: 14 }} />
        SECURE ACCOUNT RECOVERY
      </>
    ),
    heading: (
      <>
        One step left.
        <br />
        Choose a new password.
      </>
    ),
    text: 'Your purchases, library and earnings are untouched — only the password changes.',
  }

  /* ---- the link is missing or expired ---- */
  if (tokens === null || tokens?.error) {
    return (
      <AuthLayout
        side={side}
        back={{ to: '/login', label: 'Back to login' }}
        title="This link is not valid"
        subtitle="Reset links expire after an hour and can only be used once."
      >
        <div className="form-error" role="alert">
          <AlertTriangle style={{ width: 16, height: 16, flexShrink: 0 }} />
          {tokens?.error || 'Open the most recent link from your email, or request a new one.'}
        </div>
        <Link className="btn btn-gold btn-block" to="/forgot-password">
          <RefreshCcw />
          Request a new link
        </Link>
        <div className="auth-alt">
          Remembered it? <Link to="/login">Log in</Link>
        </div>
      </AuthLayout>
    )
  }

  if (tokens === undefined) {
    return (
      <AuthLayout side={side} back={{ to: '/login', label: 'Back to login' }} title="Checking your link…" subtitle="One moment.">
        <div className="skeleton-wrap">
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      </AuthLayout>
    )
  }

  /* ---- done ---- */
  if (done) {
    return (
      <AuthLayout side={side} back={{ to: '/login', label: 'Back to login' }} title="Password updated" subtitle="Taking you to the login page…">
        <div className="notice">
          <CheckCircle2 />
          <span>Your password has been changed. Sign in with the new one.</span>
        </div>
        <Link className="btn btn-gold btn-block" to="/login">
          Go to login
        </Link>
      </AuthLayout>
    )
  }

  /* ---- set the new password ---- */
  return (
    <AuthLayout
      side={side}
      back={{ to: '/login', label: 'Back to login' }}
      title={
        <>
          Set a new <span className="brand-accent">password</span>
        </>
      }
      subtitle="Choose something you have not used before."
    >
      <form onSubmit={onSubmit} noValidate>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <PasswordField
          id="new-pass"
          label="New Password"
          placeholder="Minimum 8 characters"
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            setError(null)
          }}
          required
        />
        <PasswordField
          id="confirm-pass"
          label="Confirm New Password"
          placeholder="Type it again"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value)
            setError(null)
          }}
          required
        />
        <button className="btn btn-gold btn-block" type="submit" disabled={busy}>
          <RefreshCcw />
          {busy ? 'Updating…' : 'Set New Password'}
        </button>
      </form>
    </AuthLayout>
  )
}
