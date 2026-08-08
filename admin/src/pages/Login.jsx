import { useState } from 'react'
import { AlertTriangle, LogIn, Shield, ShieldCheck } from 'lucide-react'
import Field from '@/components/ui/Field'
import { IMG } from '@/data/adminData'
import { useAuth } from '@/context/AuthContext'

/**
 * The only way into the control centre.
 *
 * Email and password, and nothing else — no one-time code and no second
 * factor. There is deliberately no sign-up and no "forgot password" here
 * either: staff accounts are created by an administrator, and both an
 * administrator and a sub-admin change their own password from Settings once
 * they are inside.
 */
export default function Login({ onLogin }) {
  const { login } = useAuth()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setError(null)
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const user = await login({ email: form.email.trim(), password: form.password })
      onLogin(user)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <div className="login-bg">
        <img src={IMG.loginBg} alt="" />
      </div>

      <div className="login-wrap">
        <div className="login-card">
          <div className="shield">
            <ShieldCheck />
          </div>
          <h1>
            Control Centre <span className="grad-text">Access</span>
          </h1>
          <p>MTONYO+ · Authorized personnel only</p>

          <form onSubmit={onSubmit} noValidate>
            {error && (
              <div className="form-error" role="alert">
                <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            <Field
              id="admin-email"
              label="Email"
              icon="mail"
              type="email"
              placeholder="admin@mtonyo.tz"
              autoComplete="username"
              value={form.email}
              onChange={set('email')}
              required
            />
            <Field
              id="admin-pass"
              label="Password"
              icon="lock"
              type="password"
              placeholder="••••••••••"
              autoComplete="current-password"
              value={form.password}
              onChange={set('password')}
              required
            />
            <button
              className="btn btn-gold btn-block"
              type="submit"
              style={{ marginTop: 6 }}
              disabled={busy}
            >
              <LogIn />
              {busy ? 'Checking…' : 'Access Control Centre'}
            </button>
          </form>

          <div className="sec-note">
            <Shield />
            Every action is recorded against your name and email
          </div>
        </div>
      </div>
    </div>
  )
}
