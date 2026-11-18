import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LogIn, Sparkles } from 'lucide-react'
import AuthLayout from '@/components/auth/AuthLayout'
import Field, { PasswordField } from '@/components/ui/Field'
import { useToast } from '@/context/ToastContext'
import { useAuth } from '@/context/AuthContext'
import { dashboardPath, getAccountSide, panelRoleFor, sideFromSearch } from '@/lib/accountSide'
import { authUrl, nextFrom } from '@/lib/nextPath'

function loginErrorMessage(err) {
  if (err?.code === 'WRONG_SIDE') {
    return err.message
  }
  const raw = String(err?.message || '').trim()
  if (/staff/i.test(raw)) {
    return 'These details do not match an account. Check your email and password.'
  }
  if (/approved creator|apply to become a creator/i.test(raw)) {
    return raw
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

/**
 * One login for everyone.
 *
 * There used to be a Watch / Create toggle here, and a viewer who chose Create
 * was offered to make a Create account on the spot. Creator access is
 * granted only by approving an application (client, 2026-10-30), so the login
 * does not ask which side: the server signs you in on the side your account has,
 * and an approved creator who last used the studio goes back to it.
 */
export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const showToast = useToast()
  const { signIn, authed, loading: authLoading, setAccountSide, user, isCreator } = useAuth()

  // Only a preference: honoured when the account really has the creator side.
  const [preferred] = useState(() => sideFromSearch(location.search) || getAccountSide())
  const [form, setForm] = useState(() => {
    const email = new URLSearchParams(location.search || '').get('email') || ''
    return { email, password: '' }
  })
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
      const panel = panelRoleFor(user?.role, preferred, isCreator)
      setAccountSide(panel)
      navigate(next || dashboardPath(panel === 'creator' ? 'creator' : 'viewer'), { replace: true })
    }
  }, [authed, authLoading, isCreator, navigate, next, preferred, setAccountSide, user?.role])

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setError(null)
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    if (busy) return
    setBusy(true) // also covers the one-frame wait below against a double tap
    /**
     * Read the fields from the form, never from React state.
     *
     * Safari Keychain, Chrome autofill and password managers often fill a box
     * without firing onChange. The boxes are uncontrolled (`defaultValue`) for
     * the same reason: while they were controlled (`value={form.x}`), the next
     * re-render — typing in the other box, tapping the eye — wrote React's
     * empty copy back over the filled box, the form posted nothing, and the
     * person saw "Enter your email and password" with both boxes visibly
     * filled a moment earlier (client, 2026-11-16). See authFields.test.js.
     */
    const formEl = e.currentTarget
    const readForm = () => {
      const posted = new FormData(formEl)
      const emailEl = formEl.querySelector('[name="email"], #login-id')
      const passEl = formEl.querySelector('[name="password"], #login-pass')
      return {
        email: String(posted.get('email') || emailEl?.value || form.email || '').trim().toLowerCase(),
        password: String(posted.get('password') || passEl?.value || form.password || ''),
        remember: Boolean(formEl.querySelector('[name="remember"]')?.checked ?? true),
      }
    }
    let { email, password, remember } = readForm()
    /**
     * Chrome withholds an autofilled password from the page until the first
     * user gesture, and releases it during that gesture — which can be this
     * very tap on "Log in". If the boxes read empty, give the browser one
     * frame to hand the values over and read again before saying anything.
     */
    if (!email || !password) {
      await new Promise((r) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => setTimeout(r, 30)) : setTimeout(r, 50)))
      ;({ email, password, remember } = readForm())
    }
    if (!email || !password) {
      setError(!email && !password ? 'Enter your email and password' : !email ? 'Enter your email address' : 'Enter your password')
      setBusy(false)
      return
    }
    setForm({ email, password: '' })

    setBusy(true)
    setError(null)
    try {
      const result = await signIn({ email, password, remember })
      let panel = panelRoleFor(result.user?.role, result.side, Boolean(result.creator))
      // An approved creator who works in the studio goes back to it.
      if (panel !== 'creator' && preferred === 'creator' && result.sides?.creator) {
        setAccountSide('creator')
        panel = 'creator'
      }
      showToast(panel === 'creator' ? 'Signed in to your creator studio.' : 'Signed in.')
      navigate(next || dashboardPath(panel === 'creator' ? 'creator' : 'viewer'), { replace: true })
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
          <>
            Your library is
            <br />
            waiting for you.
          </>
        ),
        text: 'Every video you have purchased stays in your library. Approved creators reach their studio from the same login.',
      }}
      back={{ to: '/', label: 'Back to home' }}
      title={
        <>
          Log in to <span className="brand-accent">MTONYO+</span>
        </>
      }
      subtitle="Enter your email and password."
    >
      <form onSubmit={onSubmit} noValidate>
        {expired && (
          <div className="form-error" role="status">
            Your session ended. Sign in again to continue.
          </div>
        )}
        {error && (
          <div className="form-error" role="alert">
            <span>{error}</span>
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
          defaultValue={form.email}
          onChange={set('email')}
          required
        />
        <PasswordField
          id="login-pass"
          label="Password"
          name="password"
          placeholder="••••••••"
          autoComplete="current-password"
          defaultValue=""
          onChange={set('password')}
          required
        />

        <div className="form-row">
          <label>
            {/* Off: signed out when the browser closes (sessionStorage). */}
            <input type="checkbox" name="remember" defaultChecked />
            Remember me
          </label>
          <Link
            to={`/forgot-password${form.email ? `?email=${encodeURIComponent(form.email)}` : ''}`}
          >
            Forgot password?
          </Link>
        </div>

        <button className="btn btn-gold btn-block" type="submit" disabled={busy}>
          <LogIn />
          {busy ? 'Signing in…' : 'Log in'}
        </button>
      </form>

      <div className="divider">NEW TO MTONYO+?</div>

      <button className="btn btn-ghost btn-block" onClick={() => navigate(authUrl('signup', next))} disabled={busy}>
        <Sparkles />
        Create Free Account
      </button>
      <div className="auth-alt">
        Want to publish on MTONYO+? <Link to="/signup?side=creator">Apply to become a creator</Link>
      </div>
    </AuthLayout>
  )
}
