import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, KeyRound, ShieldCheck } from 'lucide-react'
import Field from '@/components/ui/Field'
import { IMG } from '@/data/adminData'
import api from '@/lib/api'

/**
 * Where a sub-admin lands from their invitation email.
 *
 * This is not a public "forgot password" page — there is no way to reach it
 * except by holding a link an administrator caused to be sent. The person
 * chooses their own password here, which is exactly why no administrator can
 * ever see it: nobody else ever sets it.
 */
export default function Activate() {
  const navigate = useNavigate()

  /**
   * Read the token during the first render, not inside the effect.
   *
   * The effect below strips it from the address bar, and React runs effects
   * twice in development — so an effect that both reads and clears the URL
   * finds nothing the second time round and declares a perfectly good link
   * invalid. Capturing it here means it survives however many times the effect
   * runs.
   */
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token'))

  const [state, setState] = useState({ status: 'checking' })
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let alive = true
    if (!token) {
      setState({ status: 'invalid' })
      return
    }

    // Keep the token out of browser history.
    window.history.replaceState(null, '', window.location.pathname)

    api.auth
      .checkResetToken(token)
      .then((res) => alive && setState(res?.valid ? { status: 'ready', token, ...res } : { status: 'invalid' }))
      .catch((err) => alive && setState({ status: 'invalid', message: err.message }))

    return () => {
      alive = false
    }
  }, [token])

  const onSubmit = async (e) => {
    e.preventDefault()
    if (password !== confirm) return setError('The two passwords do not match')
    if (password.length < 8) return setError('Password must be at least 8 characters')

    setBusy(true)
    setError(null)
    try {
      await api.auth.resetPassword({ token: state.token, password })
      setDone(true)
      setTimeout(() => navigate('/login', { replace: true }), 1800)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const invite = state.purpose === 'invite'

  return (
    <div className="screen">
      <div className="login-bg">
        <img src={IMG.loginBg} alt="" />
      </div>

      <div className="login-wrap">
        <div className="login-card">
          <div className="shield">
            {done ? <CheckCircle2 /> : <ShieldCheck />}
          </div>

          {state.status === 'checking' && (
            <>
              <h1>
                Checking your <span className="grad-text">link</span>
              </h1>
              <p>One moment.</p>
            </>
          )}

          {state.status === 'invalid' && (
            <>
              <h1>
                This link is <span className="grad-text">not valid</span>
              </h1>
              <p>Invitation links can only be used once, and they expire.</p>
              <div className="form-error" role="alert" style={{ marginTop: 14 }}>
                <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                <span>{state.message || 'Ask an administrator to send you a new invitation.'}</span>
              </div>
              <button className="btn btn-ghost btn-block" onClick={() => navigate('/login')} style={{ marginTop: 12 }}>
                Go to login
              </button>
            </>
          )}

          {state.status === 'ready' && !done && (
            <>
              <h1>
                {invite ? 'Choose your ' : 'Set a new '}
                <span className="grad-text">password</span>
              </h1>
              <p>
                {state.email}
                {state.role === 'sub_admin' ? ' · Sub-admin' : ''}
              </p>

              <form onSubmit={onSubmit} noValidate>
                {error && (
                  <div className="form-error" role="alert">
                    <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                    <span>{error}</span>
                  </div>
                )}
                <Field
                  id="activate-pass"
                  label="Password"
                  icon="lock"
                  type="password"
                  placeholder="Minimum 8 characters"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setError(null)
                  }}
                  required
                />
                <Field
                  id="activate-confirm"
                  label="Confirm password"
                  icon="lock"
                  type="password"
                  placeholder="Type it again"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => {
                    setConfirm(e.target.value)
                    setError(null)
                  }}
                  required
                />
                <button className="btn btn-gold btn-block" type="submit" disabled={busy} style={{ marginTop: 6 }}>
                  <KeyRound />
                  {busy ? 'Saving…' : invite ? 'Activate My Account' : 'Set New Password'}
                </button>
              </form>

              <div className="sec-note">
                <ShieldCheck />
                Only you will ever know this password
              </div>
            </>
          )}

          {done && (
            <>
              <h1>
                You&apos;re <span className="grad-text">all set</span>
              </h1>
              <p>Taking you to the login page…</p>
              <button className="btn btn-gold btn-block" onClick={() => navigate('/login')} style={{ marginTop: 14 }}>
                Go to login
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
