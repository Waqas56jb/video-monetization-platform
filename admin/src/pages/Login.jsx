import { LogIn, Shield, ShieldCheck } from 'lucide-react'
import Field from '@/components/ui/Field'
import { IMG } from '@/data/adminData'

/** Super-admin gate: email + password + 2FA code. */
export default function Login({ onLogin }) {
  const onSubmit = (e) => {
    e.preventDefault()
    onLogin()
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
            Super Admin <span className="grad-text">Access</span>
          </h1>
          <p>CreatorTZ Control Center · Authorized personnel only</p>

          <form onSubmit={onSubmit}>
            <Field
              id="admin-email"
              label="Admin Email"
              icon="mail"
              type="email"
              placeholder="admin@creator.tz"
              autoComplete="username"
              required
            />
            <Field
              id="admin-pass"
              label="Password"
              icon="lock"
              type="password"
              placeholder="••••••••••"
              autoComplete="current-password"
              required
            />
            <Field
              id="admin-2fa"
              label="2FA Code"
              icon="key-round"
              type="text"
              placeholder="6-digit code from authenticator"
              inputMode="numeric"
              autoComplete="one-time-code"
            />
            <button className="btn btn-gold btn-block" type="submit" style={{ marginTop: 6 }}>
              <LogIn />
              Access Control Center
            </button>
          </form>

          <div className="sec-note">
            <Shield />
            Protected by 2FA · All actions are audit-logged
          </div>
        </div>
      </div>
    </div>
  )
}
