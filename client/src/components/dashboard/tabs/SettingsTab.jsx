import { useEffect, useState } from 'react'
import { AlertTriangle, KeyRound, LogOut, Mail, Save, ShieldAlert } from 'lucide-react'
import Panel from '../Panel'
import Field from '@/components/ui/Field'
import { ErrorState, Skeleton } from '@/components/ui/States'
import useApi from '@/hooks/useApi'
import api from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'

/**
 * The account's own controls: password, what we may email about, and the way
 * out.
 *
 * Deliberately separate from the profile. One is what other people see about
 * you; this is what happens to your account. Mixing them means a change of
 * password sitting next to a change of bio under a single Save, which is how
 * people change things they did not mean to.
 */
export default function SettingsTab() {
  const { data, loading, error, reload } = useApi(() => api.account.get(), [])

  if (loading) return <Skeleton rows={5} />
  if (error) return <ErrorState error={error} onRetry={reload} />

  return (
    <div>
      <div className="two-col">
        <PasswordPanel />
        <NotificationsPanel user={data.user} onSaved={() => reload({ quiet: true })} />
      </div>
      <SessionPanel user={data.user} />
      <DangerPanel />
    </div>
  )
}

/* ------------------------------------------------------------ password */

function PasswordPanel() {
  const showToast = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const save = async (e) => {
    e.preventDefault()
    setError(null)
    if (next !== confirm) return setError('The two new passwords do not match')
    if (next.length < 8) return setError('The new password must be at least 8 characters')
    if (next === current) return setError('The new password must be different from the current one')

    setBusy(true)
    try {
      await api.auth.changePassword({ currentPassword: current, newPassword: next })
      setCurrent('')
      setNext('')
      setConfirm('')
      showToast('Password changed — we have emailed you to say so')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Change your password">
      <form onSubmit={save} noValidate>
        {error && (
          <div className="form-error" role="alert">
            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <Field
          id="st-current"
          label="Current password"
          icon="lock"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••••"
          value={current}
          onChange={(e) => {
            setCurrent(e.target.value)
            setError(null)
          }}
          required
        />
        <Field
          id="st-new"
          label="New password"
          icon="lock"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          value={next}
          onChange={(e) => {
            setNext(e.target.value)
            setError(null)
          }}
          required
        />
        <Field
          id="st-confirm"
          label="Confirm new password"
          icon="lock"
          type="password"
          autoComplete="new-password"
          placeholder="Type it again"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value)
            setError(null)
          }}
          required
        />
        <p className="field-hint">
          We ask for your current password so that someone who finds your phone unlocked cannot
          quietly take the account.
        </p>

        <button className="btn btn-gold" type="submit" disabled={busy}>
          <KeyRound />
          {busy ? 'Changing…' : 'Change password'}
        </button>
      </form>
    </Panel>
  )
}

/* ------------------------------------------------------- notifications */

function NotificationsPanel({ user, onSaved }) {
  const showToast = useToast()
  const [prefs, setPrefs] = useState({
    emailAnnouncements: user?.preferences?.emailAnnouncements ?? true,
    emailAccountNews: user?.preferences?.emailAccountNews ?? true,
  })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setPrefs({
      emailAnnouncements: user?.preferences?.emailAnnouncements ?? true,
      emailAccountNews: user?.preferences?.emailAccountNews ?? true,
    })
  }, [user])

  const toggle = async (key) => {
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next) // move the switch now; the request catches up
    setBusy(true)
    try {
      await api.account.update({ [key]: next[key] })
      onSaved?.()
    } catch (err) {
      setPrefs(prefs) // put it back
      showToast(err.message)
    } finally {
      setBusy(false)
    }
  }

  const ROWS = [
    [
      'emailAccountNews',
      'Email me about my account',
      'Approvals, rejections, payouts, and password changes.',
    ],
    [
      'emailAnnouncements',
      'Email me announcements',
      'Occasional news from the MTONYO+ team. Announcements always appear in your inbox here either way.',
    ],
  ]

  return (
    <Panel title="Email preferences">
      {ROWS.map(([key, title, note]) => (
        <label className="check-row" key={key}>
          <input type="checkbox" checked={prefs[key]} onChange={() => toggle(key)} disabled={busy} />
          <span>
            {title}
            <small>{note}</small>
          </span>
        </label>
      ))}

      <p className="field-hint" style={{ marginTop: 16 }}>
        <Mail size={13} style={{ verticalAlign: -2, marginRight: 5 }} />
        Password resets are always sent, whatever these say — you would have no way back in
        otherwise.
      </p>
    </Panel>
  )
}

/* ------------------------------------------------------------ session */

function SessionPanel({ user }) {
  const { signOut } = useAuth()
  const showToast = useToast()
  const [busy, setBusy] = useState(false)

  const out = async () => {
    setBusy(true)
    try {
      await signOut()
    } finally {
      showToast('Signed out')
      window.location.href = '/'
    }
  }

  return (
    <Panel title="This device">
      <div className="setting-row">
        <div>
          <b>Signed in as {user?.email}</b>
          <small>
            Signing out clears this device only. Anything you have bought stays yours and will be
            here when you come back.
          </small>
        </div>
        <button className="btn btn-ghost" onClick={out} disabled={busy}>
          <LogOut />
          {busy ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </Panel>
  )
}

/* ------------------------------------------------------------- danger */

function DangerPanel() {
  const showToast = useToast()
  const { signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const close = async () => {
    setError(null)
    setBusy(true)
    try {
      const res = await api.account.close()
      showToast(res.message)
      await signOut()
      window.location.href = '/'
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Panel title="Close your account">
      <div className="danger-zone">
        <ShieldAlert />
        <div>
          <b>This cannot be undone from here.</b>
          <p>
            Your account is closed and you will not be able to sign in. Nothing you bought is
            destroyed — purchases and receipts are kept, because they are part of the platform&apos;s
            own records. Contact support if you ever want it back.
          </p>

          {!open ? (
            <button className="btn btn-ghost" onClick={() => setOpen(true)}>
              I want to close my account
            </button>
          ) : (
            <>
              {error && (
                <div className="form-error" role="alert">
                  <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                  <span>{error}</span>
                </div>
              )}
              <Field
                id="st-confirm-close"
                label="Type DELETE to confirm"
                icon="alert-triangle"
                type="text"
                placeholder="DELETE"
                value={typed}
                onChange={(e) => {
                  setTyped(e.target.value)
                  setError(null)
                }}
              />
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="btn btn-ghost" onClick={() => setOpen(false)} disabled={busy}>
                  Keep my account
                </button>
                <button
                  className="btn btn-red"
                  onClick={close}
                  disabled={busy || typed.trim() !== 'DELETE'}
                >
                  {busy ? 'Closing…' : 'Close my account'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </Panel>
  )
}
