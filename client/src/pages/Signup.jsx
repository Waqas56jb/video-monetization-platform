import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Crown, MailCheck, Rocket } from 'lucide-react'
import AuthLayout from '@/components/auth/AuthLayout'
import RoleToggle from '@/components/auth/RoleToggle'
import Field, { PasswordField } from '@/components/ui/Field'
import { useToast } from '@/context/ToastContext'
import { useAuth } from '@/context/AuthContext'
import { dashboardPath, sideFromSearch, sideLabel } from '@/lib/accountSide'
import { authUrl, nextFrom } from '@/lib/nextPath'

function signupErrorMessage(err) {
  if (err?.code === 'ALREADY_REGISTERED') {
    return err.message || 'This email already has an account on this side. Please log in.'
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

const ROLES = [
  { value: 'viewer', label: "I'm here to Watch", shortLabel: 'Watch', icon: 'user' },
  { value: 'creator', label: 'I want to Create', shortLabel: 'Create', icon: 'video' },
]

export default function Signup() {
  const navigate = useNavigate()
  const location = useLocation()
  const showToast = useToast()
  const { signUp, authed, loading: authLoading, user, isCreator, setAccountSide } = useAuth()

  const [role, setRole] = useState(() => sideFromSearch(location.search) || 'viewer')
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

  useEffect(() => {
    const fromUrl = sideFromSearch(location.search)
    if (fromUrl) setRole(fromUrl)
  }, [location.search])

  /**
   * Already signed in: Watch goes to the library. Create without studio access
   * goes to the application — nobody gets a creator dashboard from this page.
   */
  useEffect(() => {
    if (authLoading || !authed) return
    if (role === 'creator' && !isCreator) {
      navigate(dashboardPath('become'), { replace: true })
      return
    }
    setAccountSide(role)
    navigate(next || dashboardPath(role), { replace: true })
  }, [authed, authLoading, isCreator, navigate, next, role, setAccountSide])

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
      const postedRole = String(posted.get('role') || '').trim()
      const wanted =
        postedRole === 'creator' || role === 'creator' ? 'creator' : 'viewer'
      const result = await signUp({ ...form, fullName, phone, email, password, role: wanted, side: wanted })

      /**
       * Go where the account was actually made.
       *
       * This used to send every Create signup to the application form, because
       * the server made them a viewer and told the client to go and apply. The
       * side that was created is now the side that was asked for, so a Create
       * signup lands in the studio and a Watch signup lands in the library — or
       * back at whatever they were doing before they were asked to sign up.
       */
      const madeSide = result.side === 'creator' ? 'creator' : 'viewer'
      const afterSignup =
        madeSide === 'creator' ? dashboardPath('creator') : next || dashboardPath('viewer')

      if (result.needsEmailConfirmation) {
        setConfirmSent(true)
        setBusy(false)
        return
      }

      if (result.attached) {
        setAttachedOk(wanted)
        setBusy(false)
        timer.current = setTimeout(() => navigate(afterSignup, { replace: true }), 1600)
        return
      }

      if (result.signInFailed || !result.session) {
        showToast('Account created. Please sign in to continue.')
        /* On the side just created — sending them to the Watch login after a
           Create signup is how you get refused at your own front door. */
        timer.current = setTimeout(
          () => navigate(authUrl('login', afterSignup, { side: madeSide }), { replace: true }),
          900
        )
        return
      }

      showToast(
        madeSide === 'creator'
          ? 'Your creator account is ready. Upload a video and submit it for review.'
          : 'Your viewer account is ready.'
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
          text: 'Same email, same password — the new side is now open on this account.',
        }}
        back={{ to: authUrl('login', next, { side: attachedOk }), label: 'Back to login' }}
        title="Side added to your account"
        subtitle={`Opening your ${sideLabel(attachedOk)} dashboard…`}
      >
        <div className="notice">
          <span>
            You already had a MTONYO+ login — the <b>{sideLabel(attachedOk)}</b> side has been added
            to it. Same email, same password.
          </span>
        </div>
        <button
          className="btn btn-gold btn-block"
          type="button"
          onClick={() => navigate(next || dashboardPath(attachedOk), { replace: true })}
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
          role === 'creator' ? (
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
        text:
          role === 'creator'
            ? 'Create a free account, tell us about your work, and the team reviews you. Creator tools open only after approval.'
            : 'Create a free viewer account. The same email can apply to publish later.',
      }}
      back={{ to: '/', label: 'Back to home' }}
      title={
        <>
          Create your <span className="brand-accent">{role === 'creator' ? 'creator application' : 'viewer'} account</span>
        </>
      }
      subtitle={
        role === 'creator'
          ? 'Signing up does not open the studio. You apply, we review, then you publish.'
          : 'Watch and Create are different sides. The same email can apply to publish later.'
      }
    >
      <RoleToggle options={ROLES} value={role} onChange={setRole} />

      {authed && !isCreator && role === 'creator' && (
        <div className="notice" style={{ marginBottom: 18 }}>
          <span>
            You are signed in as <b>{user?.email}</b>. Opening the application form…
          </span>
        </div>
      )}

      <form onSubmit={onSubmit} noValidate>
        <input type="hidden" name="role" value={role} />
        {error && (
          <div className="form-error" role="alert">
            <span>{error}</span>
            {errorCode === 'ALREADY_REGISTERED' && (
              <Link
                to={authUrl('login', next, { side: role, email: form.email })}
                style={{ display: 'block', marginTop: 8, fontWeight: 700 }}
              >
                Log in instead
              </Link>
            )}
            {errorCode === 'EMAIL_IN_USE_WRONG_PASSWORD' && (
              <Link
                to={`/forgot-password?side=${role}&email=${encodeURIComponent(form.email || '')}`}
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
          {busy ? 'Creating your account…' : role === 'creator' ? 'Create account & apply' : 'Create Viewer Account'}
        </button>
      </form>

      <div className="auth-alt">
        Already have an account? <Link to={authUrl('login', next, { side: role })}>Log in</Link>
      </div>
    </AuthLayout>
  )
}
