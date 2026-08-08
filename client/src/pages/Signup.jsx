import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Crown, Rocket } from 'lucide-react'
import AuthLayout from '@/components/auth/AuthLayout'
import RoleToggle from '@/components/auth/RoleToggle'
import Field, { PasswordField } from '@/components/ui/Field'
import { IMG } from '@/data/content'
import { useToast } from '@/context/ToastContext'

const ROLES = [
  { value: 'viewer', label: "I'm here to Watch", icon: 'user' },
  { value: 'creator', label: "I'm a Creator", icon: 'video' },
]

export default function Signup() {
  const navigate = useNavigate()
  const showToast = useToast()
  const [role, setRole] = useState('creator')
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  const onSubmit = (e) => {
    e.preventDefault()
    showToast('🎉 Account created! Karibu CreatorTZ')
    timer.current = setTimeout(() => navigate('/dashboard'), 900)
  }

  return (
    <AuthLayout
      side={{
        image: IMG.authSignup,
        badge: (
          <>
            <Crown style={{ width: 14, height: 14 }} />
            JOIN 245+ CREATORS
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
          Create your <span className="grad-text">free account</span>
        </>
      }
      subtitle="One account for watching and creating."
    >
      <RoleToggle options={ROLES} value={role} onChange={setRole} />

      <form onSubmit={onSubmit}>
        <div className="form-grid">
          <Field
            id="signup-name"
            label="Full Name"
            icon="user"
            type="text"
            placeholder="Juma Hassan"
            autoComplete="name"
            required
          />
          <Field
            id="signup-phone"
            label="Phone (M-Pesa/Airtel)"
            icon="smartphone"
            type="tel"
            placeholder="0712 000 000"
            autoComplete="tel"
            required
          />
        </div>

        <Field
          id="signup-email"
          label="Email"
          icon="mail"
          type="email"
          placeholder="you@email.com"
          autoComplete="email"
          required
        />

        <PasswordField
          id="signup-pass"
          label="Password"
          placeholder="Minimum 8 characters"
          autoComplete="new-password"
          minLength={8}
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

        <button className="btn btn-gold btn-block" type="submit">
          <Rocket />
          Create Account
        </button>
      </form>

      <div className="auth-alt">
        Already have an account? <Link to="/login">Log in</Link>
      </div>
    </AuthLayout>
  )
}
