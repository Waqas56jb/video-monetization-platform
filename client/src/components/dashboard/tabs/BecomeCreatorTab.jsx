import { useEffect, useState } from 'react'
import { Clock, Send, ShieldCheck, XCircle } from 'lucide-react'
import Panel from '../Panel'
import Icon from '@/components/ui/Icon'
import Field, { SelectField } from '@/components/ui/Field'
import { useToast } from '@/context/ToastContext'
import useApi from '@/hooks/useApi'
import api from '@/lib/api'
import { CATEGORIES, CONTENT_TYPES } from '@/data/copy'

const linksFrom = (text) =>
  String(text || '')
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)

/**
 * Applying to sell on MTONYO+.
 *
 * Submitting grants nothing. The account stays a viewer until an administrator
 * approves the application. The form collects what the review actually needs:
 * who they are, what they make, proof of an audience, and why they want in.
 */
export default function BecomeCreatorTab() {
  const showToast = useToast()
  const status = useApi(() => api.account.creatorApplication(), [])
  const application = status.data?.application || null
  const terms = status.data?.terms || ''
  const stats = useApi(() => api.stats.platform(), [])
  const creatorShare = stats.data?.creatorSplitPercent ?? 70

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
      title: `Keep ${creatorShare}% of every sale`,
      text: 'Paid out to your M-Pesa or Airtel Money — withdraw whenever you like.',
    },
    {
      icon: 'clapperboard',
      title: 'Auto social previews',
      text: 'Every upload gets a 60-second clip you can save for Instagram and TikTok.',
    },
  ]

  const [form, setForm] = useState({
    fullName: '',
    stageName: '',
    email: '',
    phone: '',
    location: '',
    contentType: '',
    category: '',
    bio: '',
    description: '',
    whyJoin: '',
    followers: '',
    engagement: '',
    socials: '',
    sampleWork: '',
    acceptTerms: false,
  })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const me = useApi(() => api.account.get(), [])
  useEffect(() => {
    const a = me.data?.user
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

    if (!form.fullName.trim()) return setError('Enter your full name')
    if (!form.stageName.trim()) return setError('Enter the name your audience knows you as')
    if (!form.email.trim()) return setError('Enter an email address')
    if (!/^[0-9+\s-]{9,15}$/.test(form.phone.trim())) {
      return setError('Enter the phone number we can reach you on')
    }
    if (!form.location.trim()) return setError('Enter your city or country')
    if (!form.contentType) return setError('Choose the type of content you make')
    if (!form.category) return setError('Choose your main category')
    if (form.bio.trim().length < 30) return setError('Write a short bio — a sentence or two about who you are')
    if (form.description.trim().length < 30) {
      return setError('Tell us a little more about what you will publish — a sentence or two')
    }
    if (form.whyJoin.trim().length < 30) return setError('Tell us why you want to join MTONYO+')
    if (!form.followers.trim()) return setError('Tell us your follower count')
    if (!form.engagement.trim()) return setError('Tell us how your audience engages')
    const socials = linksFrom(form.socials)
    if (!socials.length) return setError('Add at least one social link')
    const sampleWork = linksFrom(form.sampleWork)
    if (!sampleWork.length) return setError('Add at least one link to sample work')
    if (!form.acceptTerms) return setError('You must accept the Creator Terms to apply')

    setBusy(true)
    try {
      await api.account.applyAsCreator({
        fullName: form.fullName.trim(),
        stageName: form.stageName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        location: form.location.trim(),
        contentType: form.contentType,
        category: form.category,
        bio: form.bio.trim(),
        description: form.description.trim(),
        whyJoin: form.whyJoin.trim(),
        followers: form.followers.trim(),
        engagement: form.engagement.trim(),
        socials,
        sampleWork,
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
              <small>Type</small>
              <b>{application.contentType || '—'}</b>
            </div>
            <div>
              <small>Category</small>
              <b>{application.category}</b>
            </div>
            <div>
              <small>Location</small>
              <b>{application.location || '—'}</b>
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
          MTONYO+ reviews everyone who sells on the platform. Tell us who you are, what you
          make, and why you want in. Creator tools open only after the team approves you. Your
          library and purchases stay exactly as they are either way.
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

          <p className="apply-section">Who you are</p>
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
            <Field
              id="ap-location"
              label="Location"
              icon="compass"
              placeholder="City, country"
              value={form.location}
              onChange={set('location')}
              required
            />
          </div>

          <p className="apply-section">Your work</p>
          <div className="form-grid">
            <SelectField
              id="ap-type"
              label="Type of content"
              icon="clapperboard"
              placeholder="Choose a format"
              options={CONTENT_TYPES}
              value={form.contentType}
              onChange={set('contentType')}
              required
            />
            <SelectField
              id="ap-category"
              label="Main category"
              icon="tag"
              placeholder="Choose a category"
              options={CATEGORIES}
              value={form.category}
              onChange={set('category')}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="ap-bio">Bio</label>
            <textarea
              id="ap-bio"
              rows={3}
              placeholder="Who you are, in a sentence or two."
              value={form.bio}
              onChange={set('bio')}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="ap-about">What will you publish on MTONYO+?</label>
            <textarea
              id="ap-about"
              rows={4}
              placeholder="The kind of content you intend to sell here."
              value={form.description}
              onChange={set('description')}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="ap-samples">Sample work</label>
            <textarea
              id="ap-samples"
              rows={3}
              placeholder={'https://youtube.com/watch?v=...\nhttps://tiktok.com/@you/video/...'}
              value={form.sampleWork}
              onChange={set('sampleWork')}
              required
            />
            <span className="field-hint">Links to existing videos. One per line.</span>
          </div>

          <p className="apply-section">Your audience</p>
          <div className="field">
            <label htmlFor="ap-socials">Social links</label>
            <textarea
              id="ap-socials"
              rows={3}
              placeholder={'https://instagram.com/yourname\nhttps://tiktok.com/@yourname'}
              value={form.socials}
              onChange={set('socials')}
              required
            />
            <span className="field-hint">One per line. Full web addresses.</span>
          </div>
          <div className="form-grid">
            <Field
              id="ap-followers"
              label="Followers"
              icon="users"
              placeholder="e.g. 12,000 on Instagram, 4,000 on TikTok"
              value={form.followers}
              onChange={set('followers')}
              required
            />
            <Field
              id="ap-engagement"
              label="Engagement"
              icon="trending-up"
              placeholder="e.g. 4% average, 8k typical views"
              value={form.engagement}
              onChange={set('engagement')}
              required
            />
          </div>

          <p className="apply-section">Why MTONYO+</p>
          <div className="field">
            <label htmlFor="ap-why">Why do you want to join MTONYO+?</label>
            <textarea
              id="ap-why"
              rows={3}
              placeholder="What you want from the platform, and what you will bring."
              value={form.whyJoin}
              onChange={set('whyJoin')}
              required
            />
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
