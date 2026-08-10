import { useState } from 'react'
import { Rocket } from 'lucide-react'
import Panel from '../Panel'
import Icon from '@/components/ui/Icon'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'

const PERKS = [
  {
    icon: 'banknote',
    title: 'Sell your way',
    text: 'Pay Once, or a Paid Premiere that becomes Free + Ads when your paid period ends and keeps earning.',
  },
  {
    icon: 'timer',
    title: 'You set the free preview',
    text: 'Decide exactly how many minutes viewers watch before the paywall appears.',
  },
  {
    icon: 'hand-coins',
    title: 'Keep 70% of every sale',
    text: 'Paid out to your M-Pesa or Airtel Money — withdraw whenever you like.',
  },
  {
    icon: 'clapperboard',
    title: 'Auto social previews',
    text: 'Every upload gets a 60-second clip to share on Instagram, TikTok and WhatsApp.',
  },
]

/**
 * A viewer's route into the studio. One MTONYO+ account does both, so this
 * upgrades the current account rather than creating a second one.
 */
export default function BecomeCreatorTab({ onUpgraded }) {
  const { becomeCreator } = useAuth()
  const showToast = useToast()
  const [busy, setBusy] = useState(false)

  const upgrade = async () => {
    if (busy) return
    setBusy(true)
    try {
      await becomeCreator()
      showToast('🎬 Creator tools unlocked — upload your first video')
      onUpgraded?.()
    } catch (err) {
      showToast(err?.message || 'Could not enable creator tools')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <Panel className="become-hero">
        <span className="badge">
          <Icon name="crown" style={{ width: 14, height: 14 }} />
          FREE TO JOIN
        </span>
        <h2>
          Start earning from the videos <span className="brand-accent">you already make.</span>
        </h2>
        <p>
          Turn on creator tools and you can upload, set your own price, and get paid by M-Pesa or
          Airtel Money before your video ever goes free. Your library and purchases stay exactly as
          they are.
        </p>
        <button className="btn btn-gold" onClick={upgrade} disabled={busy}>
          <Rocket />
          {busy ? 'Enabling…' : 'Enable Creator Tools'}
        </button>
        <small className="become-note">
          Your first upload goes to the MTONYO+ review team before it&apos;s published.
        </small>
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
