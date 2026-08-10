import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Crown, MailCheck, Rocket } from 'lucide-react'
import AuthLayout from '@/components/auth/AuthLayout'
import RoleToggle from '@/components/auth/RoleToggle'
import Field, { PasswordField } from '@/components/ui/Field'
import { useToast } from '@/context/ToastContext'
import { useAuth } from '@/context/AuthContext'
import { authUrl, nextFrom } from '@/lib/nextPath'

const ROLES = [
  { value: 'viewer', label: "I'm here to Watch", shortLabel: 'Watch', icon: 'user' },
  { value: 'creator', label: "I'm a Creator", shortLabel: 'Create', icon: 'video' },
]

export default function Signup() {
  const navigate = useNavigate()
  const location = useLocation()
  const showToast = useToast()
  const { signUp, authed, loading: authLoading } = useAuth()

  const [role, setRole] = useState('viewer')
  const [form, setForm] = useState({ fullName: '', phone: '', email: '', password: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirmSent, setConfirmSent] = useState(false)
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  /** Whatever they were doing before being asked to make an account. */
  const next = nextFrom(location)

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
      const result = await signUp({ ...form, role })

      // The project may still require an emailed confirmation link. Say so
      // plainly rather than appearing to sign them in and failing.
      if (result.needsEmailConfirmation) {
        setConfirmSent(true)
        setBusy(false)
        return
      }

      /**
       * The account exists but signing them in did not work — a rate limit, or
       * the auth service having a moment. Send them to log in rather than
       * leaving them on a form that would now tell them the email is taken.
       */
      if (result.signInFailed || !result.session) {
        showToast(result.message || 'Account created — please log in')
        timer.current = setTimeout(() => navigate(authUrl('login', next), { replace: true }), 900)
        return
      }

      showToast(`🎉 Karibu MTONYO+, ${result.user.fullName || result.user.email}!`)
      timer.current = setTimeout(() => navigate(next || '/dashboard', { replace: true }), 400)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  if (confirmSent) {
    return (
      <AuthLayout
        side={{
          badge: (
            <>
              <Crown style={{ width: 14, height: 14 }} />
              ALMOST THERE
            </>
          ),
          heading: <>Check your inbox.</>,
          text: 'We sent a confirmation link to your email address. Open it and you can sign in.',
        }}
        back={{ to: '/login', label: 'Back to login' }}
        title="Confirm your email"
        subtitle="One more step before your account is ready."
      >
        <div className="notice">
          <MailCheck />
          <span>
            A confirmation link is on its way to <b>{form.email}</b>. Open it, then come back and
            sign in.
          </span>
        </div>
        <button className="btn btn-gold btn-block" onClick={() => navigate(authUrl('login', next))}>
          Go to login
        </button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      side={{
        badge: (
          <>
            <Crown style={{ width: 14, height: 14 }} />
            FREE TO JOIN
          </>
        ),
        heading: (
          <>
            Get paid before
            <br />
            you go free.
          </>
        ),
        text: 'Create your free account, upload your first video, set your price — and start receiving M-Pesa payments today.',
      }}
      back={{ to: '/', label: 'Back to home' }}
      title={
        <>
          Create your <span className="brand-accent">free account</span>
        </>
      }
      subtitle="One account for watching and creating."
    >
      <RoleToggle options={ROLES} value={role} onChange={setRole} />

      <form onSubmit={onSubmit} noValidate>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}

        <div className="form-grid">
          <Field
            id="signup-name"
            label="Full Name"
            icon="user"
            type="text"
            placeholder="Juma Hassan"
            autoComplete="name"
            value={form.fullName}
            onChange={set('fullName')}
            required
          />
          <Field
            id="signup-phone"
            label="Phone (M-Pesa/Airtel)"
            icon="smartphone"
            type="tel"
            placeholder="0712 000 000"
            autoComplete="tel"
            value={form.phone}
            onChange={set('phone')}
          />
        </div>

        <Field
          id="signup-email"
          label="Email"
          icon="mail"
          type="email"
          placeholder="you@email.com"
          autoComplete="email"
          value={form.email}
          onChange={set('email')}
          required
        />

        <PasswordField
          id="signup-pass"
          label="Password"
          placeholder="Minimum 8 characters"
          autoComplete="new-password"
          minLength={8}
          value={form.password}
          onChange={set('password')}
          required
        />

        <div className="form-row">
          <label>
            <input type="checkbox" required />
            I agree to the
            <a href="#" style={{ marginLeft: 4 }} onClick={(e) => e.preventDefault()}>
              {' '}
              Terms &amp; Privacy
            </a>
          </label>
        </div>

        <button className="btn btn-gold btn-block" type="submit" disabled={busy}>
          <Rocket />
          {busy ? 'Creating your account…' : 'Create Account'}
        </button>
      </form>

      <div className="auth-alt">
        Already have an account? <Link to={authUrl('login', next)}>Log in</Link>
      </div>
    </AuthLayout>
  )
}
