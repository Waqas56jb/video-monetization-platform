import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LogIn, Sparkles } from 'lucide-react'
import AuthLayout from '@/components/auth/AuthLayout'
import RoleToggle from '@/components/auth/RoleToggle'
import Field, { PasswordField } from '@/components/ui/Field'
import { useToast } from '@/context/ToastContext'
import { useAuth } from '@/context/AuthContext'
import { dashboardPath, getAccountSide, panelRoleFor, sideFromSearch } from '@/lib/accountSide'
import { authUrl, nextFrom } from '@/lib/nextPath'

function loginErrorMessage(err) {
  const raw = String(err?.message || '').trim()
  if (/staff/i.test(raw)) {
    return 'These details do not match an account. Check your email and password.'
  }
  if (/does not have a creator|creator account yet|no creator account/i.test(raw)) {
    return 'No creator account is registered with this email.'
  }
  if (/incorrect|invalid login|invalid credentials/i.test(raw)) {
    return 'These details do not match an account. Check your email and password.'
  }
  if (/blocked/i.test(raw)) {
    return 'This account has been blocked. Contact support if you need help.'
  }
  if (/too many|rate limit/i.test(raw)) {
    return 'Too many sign-in attempts. Please wait a moment and try again.'
  }
  return raw || 'Unable to sign in. Please try again.'
}

const ROLES = [
  { value: 'viewer', label: "I'm here to Watch", shortLabel: 'Watch', icon: 'user' },
  { value: 'creator', label: 'I want to Create', shortLabel: 'Create', icon: 'video' },
]

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const showToast = useToast()
  const { signIn, authed, loading: authLoading, setAccountSide, user } = useAuth()

  const [side, setSide] = useState(() => sideFromSearch(location.search) || getAccountSide())
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  /**
   * Where this person was going before they were asked to sign in.
   *
   * Read once, from the URL, so it survives a reload and the trip through Sign
   * up. Signing in is an interruption to something the viewer was already doing;
   * finishing it should put them back there, not on the dashboard.
   */
  const next = nextFrom(location)
  const expired = new URLSearchParams(location.search || '').get('reason') === 'expired'

  // Already signed in? Don't make them log in twice — and don't lose their
  // destination on the way past, which is how a viewer trying to unlock a video
  // ended up on the dashboard instead.
  useEffect(() => {
    if (!authLoading && authed) {
      setAccountSide(side)
      navigate(next || dashboardPath(panelRoleFor(user?.role, side)), { replace: true })
    }
  }, [authed, authLoading, navigate, next, setAccountSide, side, user?.role])

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setError(null)
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    if (busy) return
    /**
     * Read the fields from the form, not only React state.
     *
     * Safari and Chrome autofill often paint the email and password without
     * firing onChange, so the first tap submitted empty credentials, failed,
     * and the second tap — after state had caught up — worked. That is the
     * "login never works first time" report.
     */
    const posted = new FormData(e.currentTarget)
    const emailEl = e.currentTarget.querySelector('[name="email"], #login-id')
    const passEl = e.currentTarget.querySelector('[name="password"], #login-pass')
    const email = String(posted.get('email') || emailEl?.value || form.email || '').trim().toLowerCase()
    const password = String(posted.get('password') || passEl?.value || form.password || '')
    if (!email || !password) {
      setError('Enter your email and password')
      return
    }

    setBusy(true)
    setError(null)
    try {
      await signIn({ email, password, side })
      showToast(side === 'creator' ? 'Signed in to your creator account.' : 'Signed in to your viewer account.')
      navigate(next || dashboardPath(side), { replace: true })
    } catch (err) {
      setError(loginErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      side={{
        badge: (
          <>
            <span className="dot" />
            WELCOME BACK
          </>
        ),
        heading: (
          side === 'creator' ? (
            <>
              Your studio is
              <br />
              waiting for you.
            </>
          ) : (
            <>
              Your library is
              <br />
              waiting for you.
            </>
          )
        ),
        text:
          side === 'creator'
            ? 'Log in on the Create side to upload, price, and earn. The same email also has a Watch side.'
            : 'Every video you have purchased stays in your library. The same email can also open a creator studio.',
      }}
      back={{ to: '/', label: 'Back to home' }}
      title={
        <>
          Log in to <span className="brand-accent">MTONYO+</span>
        </>
      }
      subtitle="Choose Watch or Create, then enter the same email and password."
    >
      <RoleToggle options={ROLES} value={side} onChange={setSide} />

      <form onSubmit={onSubmit} noValidate>
        {expired && (
          <div className="form-error" role="status">
            Your session ended. Sign in again to continue.
          </div>
        )}
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}

        <Field
          id="login-id"
          label="Email"
          icon="mail"
          type="email"
          name="email"
          placeholder="you@email.com"
          autoComplete="username"
          value={form.email}
          onChange={set('email')}
          required
        />
        <PasswordField
          id="login-pass"
          label="Password"
          name="password"
          placeholder="••••••••"
          autoComplete="current-password"
          value={form.password}
          onChange={set('password')}
          required
        />

        <div className="form-row">
          <label>
            <input type="checkbox" defaultChecked />
            Remember me
          </label>
          <Link to="/forgot-password">Forgot password?</Link>
        </div>

        <button className="btn btn-gold btn-block" type="submit" disabled={busy}>
          <LogIn />
          {busy ? 'Signing in…' : side === 'creator' ? 'Log in as Creator' : 'Log in as Viewer'}
        </button>
      </form>

      <div className="divider">NEW TO MTONYO+?</div>

      <button className="btn btn-ghost btn-block" onClick={() => navigate(authUrl('signup', next, { side }))} disabled={busy}>
        <Sparkles />
        Create Free Account
      </button>
    </AuthLayout>
  )
}
