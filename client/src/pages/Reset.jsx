import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, RefreshCcw, Send, ShieldCheck } from 'lucide-react'
import AuthLayout from '@/components/auth/AuthLayout'
import Field, { PasswordField } from '@/components/ui/Field'
import { IMG } from '@/data/content'
import { useToast } from '@/context/ToastContext'

export default function Reset() {
  const navigate = useNavigate()
  const showToast = useToast()
  const [sent, setSent] = useState(false)
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  const onSendCode = (e) => {
    e.preventDefault()
    setSent(true)
    showToast('Reset code sent!')
  }

  const onNewPassword = (e) => {
    e.preventDefault()
    showToast('Password updated — log in with your new password')
    timer.current = setTimeout(() => navigate('/login', { replace: true }), 900)
  }

  return (
    <AuthLayout
      side={{
        image: IMG.authReset,
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
        text: "We'll send a secure reset code to your email or phone. Your purchases and earnings stay safe.",
      }}
      back={{ to: '/login', label: 'Back to login' }}
      title={
        <>
          Reset your <span className="grad-text">password</span>
        </>
      }
      subtitle="Enter the email or phone linked to your account and we'll send you a reset code."
    >
      {sent && (
        <div className="notice">
          <CheckCircle2 />
          <span>
            Reset code sent! Check your SMS / email inbox. The code expires in 10 minutes.
          </span>
        </div>
      )}

      <form onSubmit={onSendCode}>
        <Field
          id="reset-id"
          label="Email or Phone"
          icon="mail"
          type="text"
          placeholder="you@email.com or 0712 000 000"
          autoComplete="username"
          required
        />
        <button className="btn btn-gold btn-block" type="submit">
          <Send />
          Send Reset Code
        </button>
      </form>

      <div className="divider">THEN</div>

      <form onSubmit={onNewPassword}>
        <div className="form-grid">
          <Field
            id="reset-code"
            label="Reset Code"
            icon="key-round"
            type="text"
            placeholder="6-digit code"
            inputMode="numeric"
          />
          <PasswordField
            id="reset-new-pass"
            label="New Password"
            placeholder="New password"
            autoComplete="new-password"
          />
        </div>
        <button className="btn btn-purple btn-block" type="submit">
          <RefreshCcw />
          Set New Password
        </button>
      </form>

      <div className="auth-alt">
        Remembered it? <Link to="/login">Log in</Link>
      </div>
    </AuthLayout>
  )
}
