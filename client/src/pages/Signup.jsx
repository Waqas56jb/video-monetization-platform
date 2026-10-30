import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Crown, MailCheck, Rocket } from 'lucide-react'
import AuthLayout from '@/components/auth/AuthLayout'
import Field, { PasswordField } from '@/components/ui/Field'
import { useToast } from '@/context/ToastContext'
import { useAuth } from '@/context/AuthContext'
import { dashboardPath, sideFromSearch } from '@/lib/accountSide'
import { authUrl, nextFrom } from '@/lib/nextPath'

function signupErrorMessage(err) {
  if (err?.code === 'ALREADY_REGISTERED') {
    return err.message || 'This email already has an account. Please log in.'
  }
  if (err?.code === 'EMAIL_IN_USE_WRONG_PASSWORD') {
    return (
      err.message ||
      'This email is already registered. Enter your existing password, or reset it.'
    )
  }
  const raw = String(err?.message || '').trim()
  if (/staff/i.test(raw)) {
    return 'These details do not match an account.'
  }
  if (/blocked/i.test(raw)) {
    return 'This account has been blocked. Contact support if you need help.'
  }
  return raw || 'Unable to create this account. Please try again.'
}

/**
 * Signing up makes a Watch account — for everyone.
 *
 * `?side=creator` (every "Start Creating" button) means "I want to publish":
 * the account is made the same way and the person lands on the creator
 * application. Creator access is granted only when the team approves it
 * (client, 2026-10-30). There is no Watch / Create toggle any more.
 */
export default function Signup() {
  const navigate = useNavigate()
  const location = useLocation()
  const showToast = useToast()
  const { signUp, authed, loading: authLoading, user, isCreator, setAccountSide } = useAuth()

  const applying = sideFromSearch(location.search) === 'creator' || new URLSearchParams(location.search || '').get('intent') === 'creator'
  const [form, setForm] = useState({ fullName: '', phone: '', email: '', password: '' })
  const [error, setError] = useState(null)
  const [errorCode, setErrorCode] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirmSent, setConfirmSent] = useState(false)
  const [attachedOk, setAttachedOk] = useState(null)
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  /** Whatever they were doing before being asked to make an account. */
  const next = nextFrom(location)

  /**
   * Already signed in. Wanting to publish: an approved creator goes to the
   * studio, anyone else to the application. Otherwise, back to watching.
   */
  useEffect(() => {
    if (authLoading || !authed) return
    if (applying && !isCreator) {
      navigate(dashboardPath('become'), { replace: true })
      return
    }
    const panel = applying ? 'creator' : 'viewer'
    setAccountSide(panel)
    navigate(next || dashboardPath(panel), { replace: true })
  }, [applying, authed, authLoading, isCreator, navigate, next, setAccountSide])

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setError(null)
    setErrorCode(null)
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
    setErrorCode(null)
    try {
      const result = await signUp({ ...form, fullName, phone, email, password, side: applying ? 'creator' : 'viewer' })

      // Wanting to publish → the application form. Otherwise back to watching.
      const afterSignup = result.needsCreatorApplication ? dashboardPath('become') : next || dashboardPath('viewer')

      if (result.needsEmailConfirmation) {
        setConfirmSent(true)
        setBusy(false)
        return
      }

      if (result.attached) {
        setAttachedOk('viewer')
        setBusy(false)
        timer.current = setTimeout(() => navigate(afterSignup, { replace: true }), 1600)
        return
      }

      if (result.signInFailed || !result.session) {
        showToast('Account created. Please sign in to continue.')
        timer.current = setTimeout(() => navigate(authUrl('login', afterSignup), { replace: true }), 900)
        return
      }

      showToast(
        result.needsCreatorApplication
          ? 'Your account is ready. Now tell us about your work — the team reviews every creator application.'
          : 'Your account is ready.'
      )
      timer.current = setTimeout(() => navigate(afterSignup, { replace: true }), 400)
    } catch (err) {
      setError(signupErrorMessage(err))
      setErrorCode(err?.code || null)
      setBusy(false)
    }
  }

  if (attachedOk) {
    return (
      <AuthLayout
        side={{
          badge: (
            <>
              <Crown style={{ width: 14, height: 14 }} />
              SIDE ADDED
            </>
          ),
          heading: <>You already had a login.</>,
          text: 'Same email, same password — you can now watch and buy videos too.',
        }}
        back={{ to: authUrl('login', next), label: 'Back to login' }}
        title="Watching added to your account"
        subtitle="Opening your library…"
      >
        <div className="notice">
          <span>
            You already had a MTONYO+ login — <b>Watch</b> has been added to it. Same email, same
            password.
          </span>
        </div>
        <button
          className="btn btn-gold btn-block"
          type="button"
          onClick={() => navigate(next || dashboardPath('viewer'), { replace: true })}
        >
          Continue
        </button>
      </AuthLayout>
    )
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
          applying ? (
            <>
              Apply first.
              <br />
              Then you publish.
            </>
          ) : (
            <>
              Watch first.
              <br />
              Pay only if you want more.
            </>
          )
        ),
        text: applying
          ? 'Create your free account, then tell us about your work. The team reviews every application; creator tools open only after approval.'
          : 'Create a free account to watch and buy videos.',
      }}
      back={{ to: '/', label: 'Back to home' }}
      title={
        <>
          Create your <span className="brand-accent">MTONYO+ account</span>
        </>
      }
      subtitle={
        applying
          ? 'Step 1 of 2: your account. Step 2: the creator application, reviewed by our team.'
          : 'Free to join. Pay only for the videos you want.'
      }
    >
      {authed && !isCreator && applying && (
        <div className="notice" style={{ marginBottom: 18 }}>
          <span>
            You are signed in as <b>{user?.email}</b>. Opening the application form…
          </span>
        </div>
      )}

      <form onSubmit={onSubmit} noValidate>
        {error && (
          <div className="form-error" role="alert">
            <span>{error}</span>
            {errorCode === 'ALREADY_REGISTERED' && (
              <Link
                to={authUrl('login', applying ? '/signup?side=creator' : next, { email: form.email })}
                style={{ display: 'block', marginTop: 8, fontWeight: 700 }}
              >
                Log in instead
              </Link>
            )}
            {errorCode === 'EMAIL_IN_USE_WRONG_PASSWORD' && (
              <Link
                to={`/forgot-password?email=${encodeURIComponent(form.email || '')}`}
                style={{ display: 'block', marginTop: 8, fontWeight: 700 }}
              >
                Reset password
              </Link>
            )}
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
          {busy ? 'Creating your account…' : applying ? 'Create account & continue to application' : 'Create Free Account'}
        </button>
      </form>

      <div className="auth-alt">
        Already have an account? <Link to={authUrl('login', applying ? '/signup?side=creator' : next)}>Log in</Link>
      </div>
      {!applying && (
        <div className="auth-alt">
          Want to publish on MTONYO+? <Link to="/signup?side=creator">Apply to become a creator</Link>
        </div>
      )}
    </AuthLayout>
  )
}
