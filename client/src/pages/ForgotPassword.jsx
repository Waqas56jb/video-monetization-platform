import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MailCheck, Send, ShieldCheck } from 'lucide-react'
import AuthLayout from '@/components/auth/AuthLayout'
import Field from '@/components/ui/Field'
import api from '@/lib/api'

/**
 * Step 1 of a password reset: ask for the link.
 *
 * The server checks the address against the accounts table before sending, so
 * a stranger never gets an email — but the message shown here is the same
 * either way, so this page cannot be used to find out who has an account.
 */
export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.auth.forgotPassword(email.trim())
      setSent(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      side={{
        badge: (
          <>
            <ShieldCheck style={{ width: 14, height: 14 }} />
            SECURE ACCOUNT RECOVERY
          </>
        ),
        heading: (
          <>
            Locked out?
            <br />
            We&apos;ve got you.
          </>
        ),
        text: "We'll email a secure reset link to the address on your account. Your purchases and earnings stay safe.",
      }}
      back={{ to: '/login', label: 'Back to login' }}
      title={
        <>
          Reset your <span className="brand-accent">password</span>
        </>
      }
      subtitle={
        sent
          ? 'Check your email for the link.'
          : "Enter the email on your account and we'll send you a reset link."
      }
    >
      {sent ? (
        <>
          <div className="notice">
            <MailCheck />
            <span>
              If <b>{email}</b> has an account, a reset link is on its way. The link expires in one
              hour.
            </span>
          </div>
          <button className="btn btn-ghost btn-block" onClick={() => setSent(false)}>
            Use a different email
          </button>
          <div className="auth-alt">
            Remembered it? <Link to="/login">Log in</Link>
          </div>
        </>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <Field
            id="forgot-email"
            label="Email"
            icon="mail"
            type="email"
            placeholder="you@email.com"
            autoComplete="username"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setError(null)
            }}
            required
          />
          <button className="btn btn-gold btn-block" type="submit" disabled={busy}>
            <Send />
            {busy ? 'Sending…' : 'Send Reset Link'}
          </button>
          <div className="auth-alt">
            Remembered it? <Link to="/login">Log in</Link>
          </div>
        </form>
      )}
    </AuthLayout>
  )
}
