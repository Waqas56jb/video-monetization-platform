import { useCallback, useEffect, useState } from 'react'
import {
  KeyRound,
  Mail,
  RotateCw,
  Save,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Field from '@/components/ui/Field'
import { Async } from '@/components/ui/States'
import api from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { useConfirm } from '@/context/ConfirmContext'

/**
 * Settings — the platform's own knobs, your account, and the team.
 *
 * There is no sign-up and no public reset page in this app. An administrator
 * changes their own email and password here, a sub-admin does the same for
 * theirs, and staff accounts come into being only by invitation from an
 * administrator. This screen is the whole of account management.
 */
export default function SettingsTab() {
  const { isAdmin } = useAuth()

  return (
    <div className="tab">
      <div className="two-col">
        <AccountPanel />
        {isAdmin ? <PlatformPanel /> : <SubAdminNotice />}
      </div>
      {isAdmin && <TeamPanel />}
    </div>
  )
}

/* ==================================================================== */
/* Your own account                                                      */
/* ==================================================================== */

function AccountPanel() {
  const { user, reload, roleLabel } = useAuth()
  const showToast = useToast()

  const [name, setName] = useState(user?.fullName || '')
  const [savingName, setSavingName] = useState(false)

  const [email, setEmail] = useState(user?.email || '')
  const [emailPassword, setEmailPassword] = useState('')
  const [emailError, setEmailError] = useState(null)
  const [savingEmail, setSavingEmail] = useState(false)

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwError, setPwError] = useState(null)
  const [savingPw, setSavingPw] = useState(false)

  useEffect(() => {
    setName(user?.fullName || '')
    setEmail(user?.email || '')
  }, [user])

  const saveName = async (e) => {
    e.preventDefault()
    setSavingName(true)
    try {
      await api.staff.updateProfile({ fullName: name.trim() })
      await reload()
      showToast('Name updated')
    } catch (err) {
      showToast(err.message)
    } finally {
      setSavingName(false)
    }
  }

  const saveEmail = async (e) => {
    e.preventDefault()
    setEmailError(null)
    setSavingEmail(true)
    try {
      await api.staff.updateEmail({ email: email.trim(), currentPassword: emailPassword })
      await reload()
      setEmailPassword('')
      showToast('Email updated — use it next time you sign in')
    } catch (err) {
      setEmailError(err.message)
    } finally {
      setSavingEmail(false)
    }
  }

  const savePassword = async (e) => {
    e.preventDefault()
    setPwError(null)
    if (next !== confirmPw) return setPwError('The two new passwords do not match')
    if (next.length < 8) return setPwError('The new password must be at least 8 characters')

    setSavingPw(true)
    try {
      await api.auth.changePassword({ currentPassword: current, newPassword: next })
      setCurrent('')
      setNext('')
      setConfirmPw('')
      showToast('Password changed')
    } catch (err) {
      setPwError(err.message)
    } finally {
      setSavingPw(false)
    }
  }

  return (
    <Panel
      title="Your account"
      action={<span className="pill ok">{roleLabel}</span>}
    >
      <form onSubmit={saveName}>
        <Field
          id="acct-name"
          label="Your name"
          icon="user"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="How your actions are signed in the log"
        />
        <button className="btn btn-ghost btn-sm" type="submit" disabled={savingName}>
          <Save />
          {savingName ? 'Saving…' : 'Save name'}
        </button>
      </form>

      <div className="settings-divider" />

      <form onSubmit={saveEmail}>
        <h4 className="settings-sub">
          <Mail size={15} />
          Change your email
        </h4>
        {emailError && (
          <div className="form-error" role="alert">
            {emailError}
          </div>
        )}
        <Field
          id="acct-email"
          label="Email address"
          icon="mail"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setEmailError(null)
          }}
          required
        />
        <Field
          id="acct-email-pw"
          label="Confirm with your current password"
          icon="lock"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••••"
          value={emailPassword}
          onChange={(e) => {
            setEmailPassword(e.target.value)
            setEmailError(null)
          }}
          required
        />
        <p className="field-note">
          Your password is asked for because changing the address on an account is how someone
          would quietly take it over.
        </p>
        <button className="btn btn-ghost btn-sm" type="submit" disabled={savingEmail}>
          <Save />
          {savingEmail ? 'Saving…' : 'Update email'}
        </button>
      </form>

      <div className="settings-divider" />

      <form onSubmit={savePassword}>
        <h4 className="settings-sub">
          <KeyRound size={15} />
          Change your password
        </h4>
        {pwError && (
          <div className="form-error" role="alert">
            {pwError}
          </div>
        )}
        <Field
          id="acct-current"
          label="Current password"
          icon="lock"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••••"
          value={current}
          onChange={(e) => {
            setCurrent(e.target.value)
            setPwError(null)
          }}
          required
        />
        <Field
          id="acct-new"
          label="New password"
          icon="lock"
          type="password"
          autoComplete="new-password"
          placeholder="Minimum 8 characters"
          value={next}
          onChange={(e) => {
            setNext(e.target.value)
            setPwError(null)
          }}
          required
        />
        <Field
          id="acct-confirm"
          label="Confirm new password"
          icon="lock"
          type="password"
          autoComplete="new-password"
          placeholder="Type it again"
          value={confirmPw}
          onChange={(e) => {
            setConfirmPw(e.target.value)
            setPwError(null)
          }}
          required
        />
        <button className="btn btn-gold btn-sm" type="submit" disabled={savingPw}>
          <KeyRound />
          {savingPw ? 'Changing…' : 'Change password'}
        </button>
      </form>
    </Panel>
  )
}

/* ==================================================================== */
/* Platform settings (admin only)                                        */
/* ==================================================================== */

function PlatformPanel() {
  const showToast = useToast()
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.admin.settings()
      setSettings(res.settings)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const set = (key) => (e) => {
    const raw = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setSettings((s) => ({ ...s, [key]: raw }))
  }

  /** The field names are the database's own, so nothing gets lost in translation. */
  const TOGGLES = [
    ['registrations_open', 'Registrations open', 'Turn off to stop new accounts being created'],
    ['require_creator_approval', 'Review every upload', 'Nothing goes live until a human approves it'],
    ['auto_premiere_to_free', 'Premieres become Free + Ads', 'When the paid window on a video runs out'],
    ['preroll_enabled', 'Pre-roll ads', 'Shown before Free + Ads videos'],
    ['ads_on_expired_premieres', 'Ads on expired premieres', 'Once a paid window has closed'],
    ['share_ad_revenue', 'Share ad revenue with creators', 'Uses the same split as sales'],
    ['maintenance_mode', 'Maintenance mode', 'Shows a notice to everyone on the public site'],
  ]

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await api.admin.updateSettings({
        creator_split_percent: Number(settings.creator_split_percent),
        min_video_price_tzs: Number(settings.min_video_price_tzs),
        min_withdrawal_tzs: Number(settings.min_withdrawal_tzs),
        default_premiere_days: Number(settings.default_premiere_days),
        default_preview_seconds: Number(settings.default_preview_seconds),
        preroll_skip_after_secs: Number(settings.preroll_skip_after_secs),
        ...Object.fromEntries(TOGGLES.map(([key]) => [key, Boolean(settings[key])])),
      })
      setSettings(res.settings)
      showToast('Platform settings saved')
    } catch (err) {
      showToast(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Panel title="Platform settings">
      <Async loading={loading} error={error} onRetry={load} rows={6}>
        {settings && (
          <form onSubmit={save}>
            <Field
              id="set-split"
              label="Creator share (%)"
              icon="percent"
              type="number"
              min={0}
              max={100}
              value={settings.creator_split_percent ?? ''}
              onChange={set('creator_split_percent')}
            />
            <p className="field-note">
              The platform keeps the remaining {100 - Number(settings.creator_split_percent || 0)}%.
              An individual creator can be given their own split from the Revenue screen.
            </p>

            <Field
              id="set-minprice"
              label="Minimum video price (TZS)"
              icon="banknote"
              type="number"
              min={0}
              value={settings.min_video_price_tzs ?? ''}
              onChange={set('min_video_price_tzs')}
            />
            <Field
              id="set-minwd"
              label="Minimum withdrawal (TZS)"
              icon="banknote"
              type="number"
              min={0}
              value={settings.min_withdrawal_tzs ?? ''}
              onChange={set('min_withdrawal_tzs')}
            />
            <Field
              id="set-premiere"
              label="Default Paid Premiere window (days)"
              icon="timer"
              type="number"
              min={1}
              value={settings.default_premiere_days ?? ''}
              onChange={set('default_premiere_days')}
            />
            <p className="field-note">
              A starting point only — the window is set per video when it is approved, so one
              artist can have 30 days and another 90.
            </p>
            <Field
              id="set-preview"
              label="Default free preview (seconds)"
              icon="timer"
              type="number"
              min={0}
              value={settings.default_preview_seconds ?? ''}
              onChange={set('default_preview_seconds')}
            />
            <Field
              id="set-skip"
              label="Skip pre-roll after (seconds)"
              icon="timer"
              type="number"
              min={0}
              max={60}
              value={settings.preroll_skip_after_secs ?? ''}
              onChange={set('preroll_skip_after_secs')}
            />

            <div className="settings-divider" />

            {TOGGLES.map(([key, label, hint]) => (
              <label className="check-row" key={key}>
                <input type="checkbox" checked={Boolean(settings[key])} onChange={set(key)} />
                <span>
                  {label}
                  <small>{hint}</small>
                </span>
              </label>
            ))}

            <button className="btn btn-gold" type="submit" disabled={saving}>
              <Save />
              {saving ? 'Saving…' : 'Save settings'}
            </button>
          </form>
        )}
      </Async>
    </Panel>
  )
}

function SubAdminNotice() {
  return (
    <Panel title="Platform settings">
      <div className="state-block">
        <ShieldCheck size={26} />
        <b>Administrator only</b>
        <p>
          Revenue splits, price floors and registration controls are changed by an administrator.
          You can still review content, decide withdrawals and post announcements.
        </p>
      </div>
    </Panel>
  )
}

/* ==================================================================== */
/* The moderation team (admin only)                                      */
/* ==================================================================== */

function TeamPanel() {
  const showToast = useToast()
  const confirm = useConfirm()

  const [team, setTeam] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [form, setForm] = useState({ fullName: '', email: '' })
  const [inviteError, setInviteError] = useState(null)
  const [inviting, setInviting] = useState(false)

  /**
   * Which modules a sub-admin may open.
   *
   * A sub-admin used to be one switch: in, or not in. Somebody brought on to
   * review uploads could also decide withdrawals and change the revenue split.
   * The list of modules comes from the server so it can never drift from the
   * enum the database enforces.
   */
  const [modules, setModules] = useState([])
  const [editingPerms, setEditingPerms] = useState(null)
  const [draftPerms, setDraftPerms] = useState([])
  const [savingPerms, setSavingPerms] = useState(false)

  useEffect(() => {
    if (!editingPerms) return
    setDraftPerms(editingPerms.permissions || [])
  }, [editingPerms])

  const savePermissions = async () => {
    setSavingPerms(true)
    try {
      await api.admin.setPermissions(editingPerms.id, draftPerms)
      showToast(
        draftPerms.length
          ? `${editingPerms.fullName} can now access ${draftPerms.length} module${draftPerms.length === 1 ? '' : 's'}`
          : `${editingPerms.fullName} now has no access`
      )
      setEditingPerms(null)
      load()
    } catch (err) {
      showToast(err.message)
    } finally {
      setSavingPerms(false)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.staff.subAdmins()
      setTeam(res.subAdmins || [])
      setModules(res.modules || [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const invite = async (e) => {
    e.preventDefault()
    setInviteError(null)
    setInviting(true)
    try {
      const res = await api.staff.createSubAdmin({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
      })
      showToast(res.message)
      setForm({ fullName: '', email: '' })
      load()
    } catch (err) {
      setInviteError(err.message)
    } finally {
      setInviting(false)
    }
  }

  const resend = async (s) => {
    try {
      const res = await api.staff.resendInvite(s.id)
      showToast(res.message)
      load()
    } catch (err) {
      showToast(err.message)
    }
  }

  const setStatus = async (s, status) => {
    try {
      await api.staff.setSubAdminStatus(s.id, status)
      showToast(`${s.fullName} is now ${status}`)
      load()
    } catch (err) {
      showToast(err.message)
    }
  }

  const remove = (s) =>
    confirm({
      title: `Remove ${s.fullName}?`,
      text:
        'They lose access immediately. Everything they did stays in the audit log with their ' +
        'name and email — that record does not disappear with the account.',
      onConfirm: async () => {
        try {
          const res = await api.staff.removeSubAdmin(s.id)
          showToast(res.message)
          load()
        } catch (err) {
          showToast(err.message)
        }
      },
    })

  return (
    <Panel
      title="Moderation team"
      action={<span className="pill">{team.length} sub-admin{team.length === 1 ? '' : 's'}</span>}
      style={{ marginTop: 18 }}
    >
      <form onSubmit={invite} className="invite-form">
        {inviteError && (
          <div className="form-error" role="alert">
            {inviteError}
          </div>
        )}
        <div className="invite-grid">
          <Field
            id="sub-name"
            label="Their name"
            icon="user"
            type="text"
            placeholder="Neema Mushi"
            value={form.fullName}
            onChange={(e) => {
              setForm((f) => ({ ...f, fullName: e.target.value }))
              setInviteError(null)
            }}
            required
          />
          <Field
            id="sub-email"
            label="Their email"
            icon="mail"
            type="email"
            placeholder="neema@example.com"
            value={form.email}
            onChange={(e) => {
              setForm((f) => ({ ...f, email: e.target.value }))
              setInviteError(null)
            }}
            required
          />
          <button className="btn btn-gold" type="submit" disabled={inviting}>
            <UserPlus />
            {inviting ? 'Sending…' : 'Send invitation'}
          </button>
        </div>
        <p className="field-note">
          They choose their own password from the emailed link. You will never see it — not
          because it is hidden from you, but because nobody except them ever sets it. Sub-admins
          review content, decide withdrawals and post announcements; they cannot see or change
          any account.
        </p>
      </form>

      <div className="settings-divider" />

      <Async
        loading={loading}
        error={error}
        onRetry={load}
        empty={!team.length}
        rows={3}
        emptyProps={{
          icon: Users,
          title: 'No sub-admins yet',
          hint: 'Invite someone above to help review content and handle withdrawals.',
        }}
      >
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
                <th>Can access</th>
                <th>Actions taken</th>
                <th>Last active</th>
                <th style={{ textAlign: 'right' }}>Manage</th>
              </tr>
            </thead>
            <tbody>
              {team.map((s) => (
                <tr key={s.id}>
                  <td>
                    <b>{s.fullName}</b>
                  </td>
                  <td>{s.email}</td>
                  <td>
                    {s.invitePending ? (
                      <span className="pill warn">Invitation pending</span>
                    ) : s.status === 'active' ? (
                      <span className="pill ok">Active</span>
                    ) : (
                      <span className="pill bad">{s.status}</span>
                    )}
                  </td>
                  <td>
                    {/* What they can actually reach. A sub-admin holding
                        nothing is not broken — they simply have not been given
                        a job yet, and saying so is more useful than an empty
                        cell. */}
                    {s.permissions?.length ? (
                      <div className="perm-chips">
                        {s.permissions.map((m) => (
                          <span className="pill" key={m}>
                            {m}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="pill warn">No access yet</span>
                    )}
                  </td>
                  <td>{s.actionCount}</td>
                  <td>{s.lastActionAt ? new Date(s.lastActionAt).toLocaleDateString() : '—'}</td>
                  <td className="row-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditingPerms(s)}>
                      <KeyRound size={14} />
                      Access
                    </button>
                    {s.invitePending && (
                      <button className="btn btn-ghost btn-sm" onClick={() => resend(s)}>
                        <RotateCw size={14} />
                        Resend
                      </button>
                    )}
                    {s.status === 'active' ? (
                      <button className="btn btn-ghost btn-sm" onClick={() => setStatus(s, 'suspended')}>
                        Suspend
                      </button>
                    ) : (
                      <button className="btn btn-ghost btn-sm" onClick={() => setStatus(s, 'active')}>
                        Restore
                      </button>
                    )}
                    <button className="btn btn-ghost btn-sm danger" onClick={() => remove(s)}>
                      <Trash2 size={14} />
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Async>

      {/**
        * Choosing what one person can reach.
        *
        * Presented as the whole set rather than one grant at a time, because
        * that is the question being answered — what should this person be able
        * to do — and it is also what the audit entry records.
        *
        * Nothing here is security. Every module is checked again on the server
        * on every request, and again by a trigger in the database, so a
        * sub-admin cannot grant themselves anything by calling the API.
        */}
      {editingPerms && (
        <div className="modal open" role="dialog" aria-modal="true" aria-label="Staff access">
          <div className="modal-bg" onClick={() => !savingPerms && setEditingPerms(null)} />
          <div className="modal-card perm-card">
            <h3>What {editingPerms.fullName} can access</h3>
            <p className="field-note">
              They see only what is ticked. Anything else is refused by the server, not just
              hidden.
            </p>

            <div className="perm-grid">
              {modules.map((m) => {
                const on = draftPerms.includes(m)
                return (
                  <label key={m} className={`perm-opt ${on ? 'on' : ''}`.trim()}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        setDraftPerms((list) =>
                          on ? list.filter((x) => x !== m) : [...list, m]
                        )
                      }
                    />
                    <span>{m}</span>
                  </label>
                )
              })}
            </div>

            <div className="perm-actions">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setEditingPerms(null)}
                disabled={savingPerms}
              >
                Cancel
              </button>
              <button className="btn btn-gold btn-sm" onClick={savePermissions} disabled={savingPerms}>
                <Save size={14} />
                {savingPerms ? 'Saving…' : 'Save access'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Panel>
  )
}
