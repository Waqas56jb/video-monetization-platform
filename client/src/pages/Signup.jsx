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
  { value: 'apply', label: 'I want to Create', shortLabel: 'Create', icon: 'video' },
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
    const posted = new FormData(e.currentTarget)
    const fullName = String(posted.get('fullName') || e.currentTarget.querySelector('[name="fullName"]')?.value || form.fullName || '').trim()
    const phone = String(posted.get('phone') || e.currentTarget.querySelector('[name="phone"]')?.value || form.phone || '').trim()
    const email = String(posted.get('email') || e.currentTarget.querySelector('[name="email"]')?.value || form.email || '').trim().toLowerCase()
    const password = String(posted.get('password') || e.currentTarget.querySelector('[name="password"]')?.value || form.password || '')
    if (!fullName || !email || !password) {
      setError('Enter your name, email and password')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await signUp({ ...form, fullName, phone, email, password, role: 'viewer' })

      const afterSignup =
        role === 'apply' ? '/dashboard?tab=become' : next || '/dashboard'

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
        timer.current = setTimeout(() => navigate(authUrl('login', afterSignup), { replace: true }), 900)
        return
      }

      showToast(
        role === 'apply'
          ? 'Account created. Apply to become a creator — an admin will review it.'
          : `🎉 Karibu MTONYO+, ${result.user.fullName || result.user.email}!`
      )
      timer.current = setTimeout(() => navigate(afterSignup, { replace: true }), 400)
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
      subtitle="Watch for free. Creating on MTONYO+ needs an application an admin approves."
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
            name="fullName"
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
            name="phone"
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
          name="email"
          value={form.email}
          onChange={set('email')}
          required
        />

        <PasswordField
          id="signup-pass"
          label="Password"
          placeholder="Minimum 8 characters"
          autoComplete="new-password"
          name="password"
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
