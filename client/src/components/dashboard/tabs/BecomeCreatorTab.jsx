import { useEffect, useState } from 'react'
import { Clock, Rocket, Send, ShieldCheck, XCircle } from 'lucide-react'
import Panel from '../Panel'
import Icon from '@/components/ui/Icon'
import Field from '@/components/ui/Field'
import { useToast } from '@/context/ToastContext'
import useApi from '@/hooks/useApi'
import api from '@/lib/api'
import { CATEGORIES } from '@/data/copy'

const PERKS = [
  {
    icon: 'banknote',
    title: 'Sell your way',
    text: 'Pay Once, or a Paid Premiere that becomes Free + Ads when your paid period ends and keeps earning.',
  },
  {
    icon: 'timer',
    title: 'You set the free preview',
    text: 'Decide exactly how long viewers watch before the paywall appears.',
  },
  {
    icon: 'hand-coins',
    title: 'Keep 70% of every sale',
    text: 'Paid out to your M-Pesa or Airtel Money — withdraw whenever you like.',
  },
  {
    icon: 'clapperboard',
    title: 'Auto social previews',
    text: 'Every upload gets a 60-second clip you can save for Instagram and TikTok.',
  },
]

/**
 * Applying to sell on MTONYO+.
 *
 * This was one button that made the account a creator on the spot. The
 * platform decides who publishes on it, so it is an application somebody
 * reads — and submitting grants nothing. The account stays a viewer, with a
 * viewer's tabs, until an administrator approves it.
 *
 * The three states below are the three honest things this screen can be
 * saying: you have not applied, we have your application, or we answered.
 */
export default function BecomeCreatorTab() {
  const showToast = useToast()
  const status = useApi(() => api.account.creatorApplication(), [])
  const application = status.data?.application || null
  const terms = status.data?.terms || ''

  const [form, setForm] = useState({
    fullName: '',
    stageName: '',
    email: '',
    phone: '',
    category: '',
    description: '',
    socials: '',
    acceptTerms: false,
  })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  /* Start from what the account already knows rather than asking twice. */
  const me = useApi(() => api.account.get(), [])
  useEffect(() => {
    const a = me.data?.account
    if (!a) return
    setForm((f) => ({
      ...f,
      fullName: f.fullName || a.fullName || '',
      email: f.email || a.email || '',
      phone: f.phone || a.phone || '',
    }))
  }, [me.data])

  const set = (key) => (e) => {
    const value = e?.target?.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((f) => ({ ...f, [key]: value }))
    setError(null)
  }

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setError(null)

    if (!form.acceptTerms) return setError('You must accept the Creator Terms to apply')
    if (form.description.trim().length < 30) {
      return setError('Tell us a little more about what you will publish — a sentence or two')
    }

    // One per line, blank lines dropped. Nobody should have to think about
    // commas versus newlines when pasting three links.
    const socials = form.socials
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean)

    setBusy(true)
    try {
      await api.account.applyAsCreator({
        fullName: form.fullName.trim(),
        stageName: form.stageName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        category: form.category,
        description: form.description.trim(),
        socials,
        acceptTerms: true,
      })
      showToast('Application sent — the team will review it')
      status.reload()
    } catch (err) {
      setError(err?.message || 'Could not send your application')
    } finally {
      setBusy(false)
    }
  }

  /* ---------------------------------------------------------- pending --- */
  if (application?.status === 'pending') {
    return (
      <div>
        <Panel className="become-hero">
          <span className="badge">
            <Clock style={{ width: 14, height: 14 }} />
            CREATOR APPLICATION PENDING
          </span>
          <h2>
            Your application is <span className="brand-accent">with the team.</span>
          </h2>
          <p>
            We have everything we need. You will get a message here as soon as it has been
            reviewed, and the creator tools open by themselves the moment it is approved.
          </p>
          <div className="apply-summary">
            <div>
              <small>Creator name</small>
              <b>{application.stageName}</b>
            </div>
            <div>
              <small>Category</small>
              <b>{application.category}</b>
            </div>
            <div>
              <small>Sent</small>
              <b>{new Date(application.createdAt).toLocaleDateString()}</b>
            </div>
          </div>
          <small className="become-note">
            Nothing else is needed from you. Your library and purchases are unaffected.
          </small>
        </Panel>
      </div>
    )
  }

  /* --------------------------------------------------------- the form --- */
  const declined = application?.status === 'rejected'

  return (
    <div>
      <Panel className="become-hero">
        <span className="badge">
          <Icon name="crown" style={{ width: 14, height: 14 }} />
          {declined ? 'APPLY AGAIN' : 'APPLY TO BECOME A CREATOR'}
        </span>
        <h2>
          Start earning from the videos <span className="brand-accent">you already make.</span>
        </h2>
        <p>
          MTONYO+ reviews everyone who sells on the platform. Tell us who you are and what you
          intend to publish, and the team will come back to you. Your library and purchases stay
          exactly as they are either way.
        </p>
      </Panel>

      {declined && (
        <Panel className="apply-declined">
          <span className="ad-ic">
            <XCircle size={18} />
          </span>
          <div>
            <b>Your last application was not approved</b>
            <p>{application.decisionNote || 'No reason was given.'}</p>
            <small>You are welcome to apply again below.</small>
          </div>
        </Panel>
      )}

      <Panel title="Creator application">
        <form className="apply-form" onSubmit={submit} noValidate>
          {error && (
            <div className="form-error" role="alert">
              <span>{error}</span>
            </div>
          )}

          <div className="form-grid">
            <Field
              id="ap-name"
              label="Full name"
              icon="user"
              value={form.fullName}
              onChange={set('fullName')}
              required
            />
            <Field
              id="ap-stage"
              label="Creator, business or stage name"
              icon="crown"
              placeholder="What your audience knows you as"
              value={form.stageName}
              onChange={set('stageName')}
              required
            />
            <Field
              id="ap-email"
              label="Email"
              icon="mail"
              type="email"
              value={form.email}
              onChange={set('email')}
              required
            />
            <Field
              id="ap-phone"
              label="Phone number"
              icon="smartphone"
              type="tel"
              placeholder="0712 345 678"
              value={form.phone}
              onChange={set('phone')}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="ap-category">What do you make?</label>
            <select id="ap-category" value={form.category} onChange={set('category')} required>
              <option value="">Choose a category</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="ap-about">What will you publish on MTONYO+?</label>
            <textarea
              id="ap-about"
              rows={4}
              placeholder="A sentence or two about the kind of content you intend to sell here."
              value={form.description}
              onChange={set('description')}
              required
            />
            <span className="field-hint">
              {form.description.trim().length < 30
                ? `${30 - form.description.trim().length} more characters`
                : 'Thank you — that is enough to review.'}
            </span>
          </div>

          <div className="field">
            <label htmlFor="ap-socials">Instagram, TikTok, YouTube or other links</label>
            <textarea
              id="ap-socials"
              rows={3}
              placeholder={'https://instagram.com/yourname\nhttps://tiktok.com/@yourname'}
              value={form.socials}
              onChange={set('socials')}
            />
            <span className="field-hint">One per line. Optional, but it helps the review.</span>
          </div>

          <label className="apply-terms">
            <input type="checkbox" checked={form.acceptTerms} onChange={set('acceptTerms')} />
            <span>
              {terms || 'I accept the MTONYO+ Creator Terms.'}{' '}
              <a href="/legal/creator" target="_blank" rel="noopener noreferrer">
                Read them
              </a>
            </span>
          </label>

          <button className="btn btn-gold btn-block" type="submit" disabled={busy}>
            <Send size={16} />
            {busy ? 'Sending…' : 'Submit application'}
          </button>

          <small className="become-note">
            <ShieldCheck size={13} />
            Submitting does not change your account. Creator tools open only after the team
            approves you.
          </small>
        </form>
      </Panel>

      <div className="become-grid">
        {PERKS.map((p) => (
          <div className="become-card" key={p.title}>
            <span className="bc-ic">
              <Icon name={p.icon} />
            </span>
            <b>{p.title}</b>
            <p>{p.text}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
