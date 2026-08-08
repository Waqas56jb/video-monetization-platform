import { useEffect, useRef, useState } from 'react'
import { Check, Info, Library, Play, ShieldCheck, X, Zap } from 'lucide-react'
import Field from '@/components/ui/Field'
import useLockBodyScroll from '@/hooks/useLockBodyScroll'

const METHODS = [
  { value: 'mpesa', logo: 'M-PESA', logoCls: 'pm-mpesa', name: 'M-Pesa', note: 'Vodacom · Pay from your phone' },
  { value: 'airtel', logo: 'AIRTEL', logoCls: 'pm-airtel', name: 'Airtel Money', note: 'Airtel · Pay from your phone' },
]

const CONFETTI_COLORS = ['#f5c518', '#7c3aed', '#22c55e', '#a78bfa', '#ffd94a']

function makeConfetti() {
  return Array.from({ length: 36 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    background: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    borderRadius: Math.random() > 0.5 ? '50%' : '3px',
    animation: `confetti ${1.4 + Math.random() * 1.4}s ${Math.random() * 0.5}s ease-out forwards`,
  }))
}

/**
 * Three-step mobile-money checkout:
 *   1 — pick M-Pesa / Airtel + confirm number
 *   2 — "check your phone" spinner (2.6s, mirrors the STK push wait)
 *   3 — success + confetti burst
 */
export default function PaymentModal({
  open,
  video,
  phone = '0712 345 890',
  onClose,
  onContinueWatching,
  onGoToLibrary,
}) {
  const [step, setStep] = useState(1)
  const [method, setMethod] = useState('mpesa')
  const [confetti, setConfetti] = useState([])
  const timers = useRef([])

  useLockBodyScroll(open)

  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }

  // Reset to step 1 every time the modal opens.
  useEffect(() => {
    if (open) {
      setStep(1)
      setConfetti([])
    } else {
      clearTimers()
    }
  }, [open])

  useEffect(() => () => clearTimers(), [])

  // Close on Escape, like any well-behaved dialog.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const payNow = () => {
    setStep(2)
    timers.current.push(
      setTimeout(() => {
        setStep(3)
        setConfetti(makeConfetti())
        timers.current.push(setTimeout(() => setConfetti([]), 3200))
      }, 2600)
    )
  }

  return (
    <div className={`modal ${open ? 'open' : ''}`.trim()} role="dialog" aria-modal="true" aria-label="Unlock full video">
      <div className="modal-bg" onClick={onClose} />

      <div className="modal-card">
        <button className="modal-x" onClick={onClose} aria-label="Close">
          <X />
        </button>

        {confetti.map((c) => (
          <span
            key={c.id}
            className="confetti"
            style={{
              left: c.left,
              background: c.background,
              borderRadius: c.borderRadius,
              animation: c.animation,
            }}
          />
        ))}

        {/* ---- STEP 1: choose method ---- */}
        {step === 1 && (
          <div>
            <h3>Unlock Full Video</h3>
            <p className="msub">{video.title} · Paid Premiere</p>

            <div className="pay-summary">
              <div>
                <small>Amount to pay</small>
                <b>One-time payment</b>
              </div>
              <span className="amt">{video.price}</span>
            </div>

            <div className="pay-methods">
              {METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  className={`pay-m ${method === m.value ? 'on' : ''}`.trim()}
                  onClick={() => setMethod(m.value)}
                  aria-pressed={method === m.value}
                >
                  <span className={`pm-logo ${m.logoCls}`}>{m.logo}</span>
                  <div>
                    <b>{m.name}</b>
                    <small>{m.note}</small>
                  </div>
                  <span className="radio" />
                </button>
              ))}
            </div>

            <Field
              id="pay-phone"
              label="Mobile Money Number"
              icon="smartphone"
              type="tel"
              defaultValue={phone}
            />

            <button className="btn btn-gold btn-block" onClick={payNow}>
              <Zap />
              Pay Now — {video.price}
            </button>
            <div className="secure-note">
              <ShieldCheck />
              Secure, fast and encrypted payment
            </div>
          </div>
        )}

        {/* ---- STEP 2: processing ---- */}
        {step === 2 && (
          <div className="center">
            <div className="spinner" />
            <h3>Check your phone…</h3>
            <p className="msub">
              We&apos;ve sent a payment request to <b style={{ color: '#fff' }}>{phone}</b>.
              <br />
              Enter your PIN to approve <b style={{ color: 'var(--gold)' }}>{video.price}</b>.
            </p>
            <div className="notice" style={{ textAlign: 'left' }}>
              <Info />
              <span>
                Payment is verified automatically. Your video will unlock the moment it&apos;s
                confirmed.
              </span>
            </div>
          </div>
        )}

        {/* ---- STEP 3: success ---- */}
        {step === 3 && (
          <div className="center">
            <div className="success-ic">
              <Check />
            </div>
            <h3 style={{ color: 'var(--green)' }}>Payment Successful!</h3>
            <p className="msub">
              You can now watch the <b style={{ color: '#fff' }}>full video</b>.
              <br />
              It&apos;s saved to your library — unlocked forever, on any device.
            </p>
            <button className="btn btn-gold btn-block" onClick={onContinueWatching}>
              <Play />
              Continue Watching
            </button>
            <button
              className="btn btn-ghost btn-block"
              style={{ marginTop: 12 }}
              onClick={onGoToLibrary}
            >
              <Library />
              Go to My Library
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
