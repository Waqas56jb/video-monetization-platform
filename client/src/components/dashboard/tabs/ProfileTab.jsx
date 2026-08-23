import { useEffect, useState } from 'react'
import { AlertTriangle, BadgeCheck, Camera, Check, Save, Trash2, User } from 'lucide-react'
import Panel from '../Panel'
import Field, { PasswordField } from '@/components/ui/Field'
import { ErrorState, Skeleton } from '@/components/ui/States'
import useApi, { shortDate } from '@/hooks/useApi'
import api from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'

/**
 * Who you are on MTONYO+.
 *
 * The same page for a viewer and a creator — one account does both here, so
 * splitting it would mean two places for the same name to drift apart. A
 * creator simply gets the extra fields that only mean something once you are
 * selling: the name that appears on your videos, and where the money goes.
 */
const MAX_BIO = 500

export default function ProfileTab() {
  const showToast = useToast()
  const { reload: reloadAuth, isCreator } = useAuth()
  const { data, loading, error, reload } = useApi(() => api.account.get(), [])

  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [avatar, setAvatar] = useState(null)

  useEffect(() => {
    if (!data?.user) return
    const u = data.user
    const c = data.creator
    setAvatar(u.avatarUrl)
    setForm({
      fullName: u.fullName || '',
      phone: u.phone || '',
      bio: c?.bio ?? u.bio ?? '',
      location: c?.location ?? u.location ?? '',
      website: u.website || '',
      displayName: c?.displayName || '',
    })
  }, [data])

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setFormError(null)
  }

  const save = async (e) => {
    e.preventDefault()
    setFormError(null)

    if (form.fullName.trim().length < 2) return setFormError('Enter your name')
    if (form.website && !/^https?:\/\//i.test(form.website.trim())) {
      return setFormError('A web address needs to start with https://')
    }

    setSaving(true)
    try {
      await api.account.update({
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        bio: form.bio.trim(),
        location: form.location.trim(),
        website: form.website.trim(),
        ...(isCreator && form.displayName.trim() ? { displayName: form.displayName.trim() } : {}),
      })
      await reloadAuth() // the header shows this name
      reload({ quiet: true })
      showToast('Profile saved')
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // so choosing the same file twice still fires
    if (!file) return

    if (!file.type.startsWith('image/')) return showToast('Choose an image file')
    if (file.size > 2 * 1024 * 1024) {
      return showToast(`That image is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 2 MB`)
    }

    // Show it immediately; the upload catches up. A photo that takes four
    // seconds to appear feels like it did not work.
    const preview = URL.createObjectURL(file)
    setAvatar(preview)
    setUploading(true)

    try {
      const res = await api.account.uploadAvatar(file)
      setAvatar(res.avatarUrl)
      await reloadAuth()
      showToast('Photo updated')
    } catch (err) {
      setAvatar(data?.user?.avatarUrl || null)
      showToast(err.message)
    } finally {
      URL.revokeObjectURL(preview)
      setUploading(false)
    }
  }

  const removePhoto = async () => {
    setUploading(true)
    try {
      await api.account.removeAvatar()
      setAvatar(null)
      await reloadAuth()
      showToast('Photo removed')
    } catch (err) {
      showToast(err.message)
    } finally {
      setUploading(false)
    }
  }

  if (loading || !form) return <Skeleton rows={5} />
  if (error) return <ErrorState error={error} onRetry={reload} />

  const u = data.user

  return (
    <div className="profile-layout">
      <div className="profile-main">
        <Panel title="Your details">
          <form onSubmit={save} noValidate>
            {formError && (
              <div className="form-error" role="alert">
                <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                <span>{formError}</span>
              </div>
            )}

            <Field
              id="pf-name"
              label="Full name"
              icon="user"
              type="text"
              value={form.fullName}
              onChange={set('fullName')}
              required
            />

            {isCreator && (
              <>
                <Field
                  id="pf-display"
                  label="Creator name"
                  icon="video"
                  type="text"
                  placeholder="The name that appears on your videos"
                  value={form.displayName}
                  onChange={set('displayName')}
                />
                <p className="field-hint">
                  Leave it empty and your full name is used. This is what viewers see.
                </p>
                {data?.creator?.verified ? (
                  <p className="verified-note">
                    <BadgeCheck size={15} aria-hidden="true" />
                    Verified creator — granted by MTONYO+ staff. You cannot add or remove this
                    yourself.
                  </p>
                ) : (
                  <p className="field-hint">
                    A verified tick on your videos is granted by MTONYO+ staff. It does not appear
                    on this form.
                  </p>
                )}
              </>
            )}

            <div className="form-grid">
              <Field
                id="pf-phone"
                label="Phone (M-Pesa / Airtel)"
                icon="smartphone"
                type="tel"
                placeholder="0712 000 000"
                value={form.phone}
                onChange={set('phone')}
              />
              <Field
                id="pf-location"
                label="Where you are"
                icon="map-pin"
                type="text"
                placeholder="Dar es Salaam"
                value={form.location}
                onChange={set('location')}
              />
            </div>

            <div className="field">
              <label htmlFor="pf-bio">About you</label>
              <textarea
                id="pf-bio"
                rows={4}
                maxLength={MAX_BIO}
                placeholder={
                  isCreator
                    ? 'Tell people what you make and why they should pay for it.'
                    : 'A line or two about you.'
                }
                value={form.bio}
                onChange={set('bio')}
              />
              <p className="field-hint">
                {form.bio.length}/{MAX_BIO}
              </p>
            </div>

            <Field
              id="pf-website"
              label="Website or social link"
              icon="link"
              type="url"
              placeholder="https://instagram.com/you"
              value={form.website}
              onChange={set('website')}
            />

            <button className="btn btn-gold" type="submit" disabled={saving}>
              {saving ? <Check /> : <Save />}
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </form>
        </Panel>

        {isCreator && (
          <Panel title="Getting paid">
            <PayoutForm creator={data.creator} onSaved={() => reload({ quiet: true })} />
          </Panel>
        )}
      </div>
    </div>
  )
}

/**
 * Where the money goes.
 *
 * Kept apart from the rest of the profile on purpose: it is the one part where
 * a typo costs somebody real money, and it deserves its own deliberate save.
 */
function PayoutForm({ creator, onSaved }) {
  const showToast = useToast()
  const [phone, setPhone] = useState(creator?.payoutPhone || '')
  const [method, setMethod] = useState(creator?.payoutMethod || 'mpesa')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  /**
   * The password is only asked for when something actually changes.
   *
   * This is the bank account, and thirty seconds at an unlocked phone would
   * otherwise be enough to point a creator's earnings somewhere else — they
   * would find out at the next withdrawal. Someone who opens this panel and
   * saves it unchanged is not asked for anything.
   */
  const changed =
    phone.trim() !== (creator?.payoutPhone || '') || method !== (creator?.payoutMethod || 'mpesa')

  const save = async (e) => {
    e.preventDefault()
    setError(null)
    if (!/^[0-9+\s-]{9,15}$/.test(phone.trim())) {
      return setError('Enter the mobile money number your payouts should go to')
    }
    if (changed && !password) {
      return setError('Confirm your password to change where your money is sent')
    }
    setSaving(true)
    try {
      await api.account.update({
        payoutPhone: phone.trim(),
        payoutMethod: method,
        ...(changed ? { currentPassword: password } : {}),
      })
      setPassword('')
      showToast('Payout details saved')
      onSaved?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} noValidate>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}

      <div className="role-toggle" style={{ marginBottom: 16 }}>
        {[
          ['mpesa', 'M-Pesa'],
          ['airtel', 'Airtel Money'],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={method === value ? 'on' : ''}
            onClick={() => setMethod(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <Field
        id="pf-payout"
        label="Payout number"
        icon="banknote"
        type="tel"
        placeholder="0712 000 000"
        value={phone}
        onChange={(e) => {
          setPhone(e.target.value)
          setError(null)
        }}
      />
      <p className="field-hint">
        Withdrawals are sent here. Check it carefully — money sent to the wrong number is not
        easy to get back.
      </p>

      {changed && (
        <>
          <PasswordField
            id="pf-payout-pass"
            label="Confirm your password"
            placeholder="••••••••"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setError(null)
            }}
          />
          <p className="field-hint">
            Asked for because you are changing where your money is sent. We will email you
            afterwards either way.
          </p>
        </>
      )}

      <button className="btn btn-gold" type="submit" disabled={saving}>
        <Save />
        {saving ? 'Saving…' : 'Save payout details'}
      </button>
    </form>
  )
}

const initialsOf = (name = '') =>
  String(name)
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || <User />
