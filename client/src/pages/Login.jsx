import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LogIn, Sparkles } from 'lucide-react'
import AuthLayout from '@/components/auth/AuthLayout'
import Field, { PasswordField } from '@/components/ui/Field'
import { useToast } from '@/context/ToastContext'
import { useAuth } from '@/context/AuthContext'
import { authUrl, nextFrom } from '@/lib/nextPath'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const showToast = useToast()
  const { signIn, authed, loading: authLoading } = useAuth()

  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  /**
   * Where this person was going before they were asked to sign in.
   *
   * Read once, from the URL, so it survives a reload and the trip through Sign
   * up. Signing in is an interruption to something the viewer was already doing;
   * finishing it should put them back there, not on the dashboard.
   */
  const next = nextFrom(location)

  // Already signed in? Don't make them log in twice — and don't lose their
  // destination on the way past, which is how a viewer trying to unlock a video
  // ended up on the dashboard instead.
  useEffect(() => {
    if (!authLoading && authed) navigate(next || '/dashboard', { replace: true })
  }, [authed, authLoading, navigate, next])

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setError(null)
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const user = await signIn(form)
      showToast(`Karibu tena, ${user.fullName || user.email}!`)
      timer.current = setTimeout(() => navigate(next || '/dashboard', { replace: true }), 400)
    } catch (err) {
      setError(err.message)
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
        text: "Every video you've purchased stays in your library. Log in from any device — your content follows you.",
      }}
      back={{ to: '/', label: 'Back to home' }}
      title={
        <>
          Log in to <span className="brand-accent">MTONYO+</span>
        </>
      }
      subtitle="Enter your details to continue watching & earning."
    >
      <form onSubmit={onSubmit} noValidate>
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
          placeholder="you@email.com"
          autoComplete="username"
          value={form.email}
          onChange={set('email')}
          required
        />
        <PasswordField
          id="login-pass"
          label="Password"
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
          {busy ? 'Signing in…' : 'Log In'}
        </button>
      </form>

      <div className="divider">NEW TO MTONYO+?</div>

      <button className="btn btn-ghost btn-block" onClick={() => navigate(authUrl('signup', next))} disabled={busy}>
        <Sparkles />
        Create Free Account
      </button>
    </AuthLayout>
  )
}
