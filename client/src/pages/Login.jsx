import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LogIn, Sparkles } from 'lucide-react'
import AuthLayout from '@/components/auth/AuthLayout'
import RoleToggle from '@/components/auth/RoleToggle'
import Field, { PasswordField } from '@/components/ui/Field'
import { IMG } from '@/data/content'
import { useToast } from '@/context/ToastContext'

const ROLES = [
  { value: 'viewer', label: 'Viewer', icon: 'user' },
  { value: 'creator', label: 'Creator', icon: 'video' },
]

export default function Login() {
  const navigate = useNavigate()
  const showToast = useToast()
  const [role, setRole] = useState('viewer')
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  const onSubmit = (e) => {
    e.preventDefault()
    showToast('Karibu tena! Logged in successfully')
    timer.current = setTimeout(() => navigate('/dashboard'), 800)
  }

  return (
    <AuthLayout
      side={{
        image: IMG.authLogin,
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
        text: "Every video you've purchased stays unlocked forever. Log in from any device — your content follows you.",
      }}
      back={{ to: '/', label: 'Back to home' }}
      title={
        <>
          Log in to <span className="brand-accent">Mtonyo+</span>
        </>
      }
      subtitle="Enter your details to continue watching & earning."
    >
      <RoleToggle options={ROLES} value={role} onChange={setRole} />

      <form onSubmit={onSubmit}>
        <Field
          id="login-id"
          label="Email or Phone"
          icon="mail"
          type="text"
          placeholder="you@email.com or 0712 000 000"
          autoComplete="username"
          required
        />
        <PasswordField
          id="login-pass"
          label="Password"
          placeholder="••••••••"
          autoComplete="current-password"
          required
        />

        <div className="form-row">
          <label>
            <input type="checkbox" defaultChecked />
            Remember me
          </label>
          <Link to="/reset">Forgot password?</Link>
        </div>

        <button className="btn btn-gold btn-block" type="submit">
          <LogIn />
          Log In
        </button>
      </form>

      <div className="divider">NEW TO MTONYO+?</div>

      <button className="btn btn-ghost btn-block" onClick={() => navigate('/signup')}>
        <Sparkles />
        Create Free Account
      </button>
    </AuthLayout>
  )
}
