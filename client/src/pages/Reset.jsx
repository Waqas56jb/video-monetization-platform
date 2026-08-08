import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, RefreshCcw, ShieldCheck, AlertTriangle } from 'lucide-react'
import AuthLayout from '@/components/auth/AuthLayout'
import { PasswordField } from '@/components/ui/Field'
import api from '@/lib/api'
import { useToast } from '@/context/ToastContext'

/**
 * Step 2 of a password reset: choose the new password.
 *
 * The link that got them here carries a single-use token we issued and emailed
 * ourselves. Holding that link is the proof of identity — there is no code to
 * type and no second factor.
 *
 * The token is checked with the server *before* the form appears, so an expired
 * or already-used link says so straight away rather than after someone has
 * carefully typed a new password twice.
 */
export default function Reset() {
  const navigate = useNavigate()
  const showToast = useToast()

  /**
   * Read the token during the first render, not inside the effect.
   *
   * The effect below strips it from the address bar, and React runs effects
   * twice in development — so an effect that both reads and clears the URL
   * finds nothing the second time round and tells the user their perfectly
   * good link has expired. Capturing it here means it survives however many
   * times the effect runs.
   */
  const [token] = useState(() =>
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('token')
  )

  const [state, setState] = useState({ status: 'checking' })
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let alive = true

    if (!token) {
      setState({ status: 'invalid' })
      return
    }

    // Take the token out of the address bar so it is not left sitting in
    // browser history or handed to whatever the user visits next.
    window.history.replaceState(null, '', window.location.pathname)

    api.auth
      .checkResetToken(token)
      .then((res) => {
        if (!alive) return
        setState(res?.valid ? { status: 'ready', token, ...res } : { status: 'invalid' })
      })
      .catch((err) => alive && setState({ status: 'invalid', message: err.message }))

    return () => {
      alive = false
    }
  }, [token])

  const onSubmit = async (e) => {
    e.preventDefault()
    if (password !== confirm) return setError('The two passwords do not match')
    if (password.length < 8) return setError('Password must be at least 8 characters')

    setBusy(true)
    setError(null)
    try {
      await api.auth.resetPassword({ token: state.token, password })
      setDone(true)
      showToast('Password updated — sign in with your new password')
      setTimeout(() => navigate('/login', { replace: true }), 1600)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const invite = state.purpose === 'invite'

  const side = {
    badge: (
      <>
        <ShieldCheck style={{ width: 14, height: 14 }} />
        SECURE ACCOUNT RECOVERY
      </>
    ),
    heading: invite ? (
      <>
        Welcome aboard.
        <br />
        Choose your password.
      </>
    ) : (
      <>
        One step left.
        <br />
        Choose a new password.
      </>
    ),
    text: invite
      ? 'Only you will ever know this password — nobody at MTONYO+ can see it.'
      : 'Your purchases, library and earnings are untouched — only the password changes.',
  }

  const back = { to: '/login', label: 'Back to login' }

  /* ---- still checking the link ---- */
  if (state.status === 'checking') {
    return (
      <AuthLayout side={side} back={back} title="Checking your link…" subtitle="One moment.">
        <div className="skeleton-wrap">
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      </AuthLayout>
    )
  }

  /* ---- the link is missing, expired or already used ---- */
  if (state.status === 'invalid') {
    return (
      <AuthLayout
        side={side}
        back={back}
        title="This link is not valid"
        subtitle="Reset links expire after an hour and can only be used once."
      >
        <div className="form-error" role="alert">
          <AlertTriangle style={{ width: 16, height: 16, flexShrink: 0 }} />
          {state.message || 'Open the most recent link from your email, or request a new one.'}
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

  /* ---- done ---- */
  if (done) {
    return (
      <AuthLayout side={side} back={back} title="Password updated" subtitle="Taking you to the login page…">
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
      back={back}
      title={
        invite ? (
          <>
            Set your <span className="brand-accent">password</span>
          </>
        ) : (
          <>
            Set a new <span className="brand-accent">password</span>
          </>
        )
      }
      subtitle={
        state.email
          ? `For ${state.email}. Choose something you have not used before.`
          : 'Choose something you have not used before.'
      }
    >
      <form onSubmit={onSubmit} noValidate>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <PasswordField
          id="new-pass"
          label={invite ? 'Password' : 'New Password'}
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
          label="Confirm Password"
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
          {busy ? 'Updating…' : invite ? 'Activate My Account' : 'Set New Password'}
        </button>
      </form>
    </AuthLayout>
  )
}
