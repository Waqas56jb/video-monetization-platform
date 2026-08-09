import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  BadgeCheck,
  FlaskConical,
  Library,
  Play,
  Smartphone,
  X,
  Zap,
} from 'lucide-react'
import Field from '@/components/ui/Field'
import api from '@/lib/api'
import useApi from '@/hooks/useApi'
import { tzs } from '@/hooks/useApi'
import useLockBodyScroll from '@/hooks/useLockBodyScroll'

/**
 * Paying for a video with mobile money.
 *
 * The flow mirrors what actually happens on a phone in Tanzania: you enter
 * your number, a prompt appears on the handset, you approve it there, and this
 * screen waits. So this waits too — polling the payment until the provider
 * settles it — rather than pretending success the moment the button is pressed.
 *
 * Nothing here decides whether the video unlocks. The server does, when the
 * provider confirms the money. This screen only reports what it is told.
 */
const METHODS = [
  { value: 'mpesa', label: 'M-Pesa', hint: 'Vodacom' },
  { value: 'airtel', label: 'Airtel Money', hint: 'Airtel' },
]

export default function PaymentModal({ open, video, onClose, onUnlocked, onGoToLibrary }) {
  // Only ask while the dialog is open; there is no reason to poll otherwise.
  const { data: platform } = useApi(() => api.stats.platform(), [open], { skip: !open })
  const isSandbox = platform?.paymentProvider === 'sandbox'

  const [step, setStep] = useState('form') // form | waiting | done | failed
  const [method, setMethod] = useState('mpesa')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState(null)
  const [payment, setPayment] = useState(null)
  const polling = useRef(null)

  useLockBodyScroll(open)

  useEffect(() => {
    if (open) return
    // Reset once it has closed, so reopening starts clean.
    setStep('form')
    setError(null)
    setPayment(null)
    clearInterval(polling.current)
  }, [open])

  useEffect(() => () => clearInterval(polling.current), [])

  // Escape closes, like any well-behaved dialog — but not while the phone is
  // waiting on a prompt, where closing would look like the payment vanished.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && step !== 'waiting' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, step, onClose])

  const watch = (paymentId) => {
    clearInterval(polling.current)
    let elapsed = 0

    const tick = async () => {
      elapsed += 1
      try {
        const res = await api.payments.one(paymentId)
        setPayment(res.payment)

        if (res.unlocked || res.payment?.status === 'success') {
          clearInterval(polling.current)
          setStep('done')
          return
        }
        if (['failed', 'cancelled', 'expired'].includes(res.payment?.status)) {
          clearInterval(polling.current)
          setError(res.payment.failureReason || 'The payment did not go through.')
          setStep('failed')
          return
        }
      } catch {
        /* a blip is not a failed payment — keep waiting */
      }

      // Mobile money prompts expire; after three minutes, stop pretending.
      if (elapsed > 180) {
        clearInterval(polling.current)
        setError('We did not hear back from your phone. Nothing was charged — try again.')
        setStep('failed')
      }
    }

    // Sandbox settles in ~3s — poll every second so success appears promptly.
    polling.current = setInterval(tick, 1000)
    setTimeout(tick, 2500)
  }

  const pay = async (e) => {
    e.preventDefault()
    setError(null)

    if (!/^[0-9+\s-]{9,15}$/.test(phone.trim())) {
      return setError('Enter the mobile money number to charge')
    }

    setStep('waiting')
    try {
      const res = await api.payments.initiate({
        videoId: video.id,
        method,
        phone: phone.trim(),
        // Milestone 2 sandbox: always succeed after ~3s. Real AirPay in M3.
        ...(isSandbox ? { simulate: 'success' } : {}),
      })
      setPayment(res.payment)
      watch(res.payment.id)
    } catch (err) {
      setError(err.message)
      setStep('failed')
    }
  }

  if (!open) return null

  return (
    <div className="modal open" role="dialog" aria-modal="true" aria-label="Unlock this video">
      <div className="modal-bg" onClick={() => step !== 'waiting' && onClose()} />
      <div className="modal-card">
        {step !== 'waiting' && (
          <button className="modal-x" onClick={onClose} aria-label="Close">
            <X />
          </button>
        )}

        {/* ------------------------------------------------------- form */}
        {step === 'form' && (
          <form onSubmit={pay} noValidate>
            <span className="pay-ic">
              <Zap />
            </span>
            <h3>Unlock &ldquo;{video.title}&rdquo;</h3>
            <p className="pay-sub">
              One payment of <b>{tzs(video.priceTzs)}</b>. It stays in your library forever, on
              every device you log into.
            </p>

            {error && (
              <div className="form-error" role="alert">
                <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            <div className="pay-methods">
              {METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  className={`pay-method ${method === m.value ? 'on' : ''}`.trim()}
                  onClick={() => setMethod(m.value)}
                  aria-pressed={method === m.value}
                >
                  <b>{m.label}</b>
                  <small>{m.hint}</small>
                </button>
              ))}
            </div>

            <Field
              id="pay-phone"
              label="Mobile money number"
              icon="smartphone"
              type="tel"
              inputMode="tel"
              placeholder={isSandbox ? '0712 345 678' : '0712 000 000'}
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value)
                setError(null)
              }}
              required
            />

            <button className="btn btn-gold btn-block" type="submit">
              <Zap />
              Pay {tzs(video.priceTzs)}
            </button>
            <small className="pay-note">
              You&apos;ll get a prompt on your phone. Approve it there and this page unlocks by
              itself.
            </small>

            {isSandbox && (
              <div className="sandbox-note">
                <FlaskConical size={14} />
                <div>
                  <b>Test mode — no real money moves.</b>
                  <span>
                    After about 3 seconds this will show payment successful and unlock the video.
                    The real M-Pesa / Airtel gateway comes in Milestone 3.
                  </span>
                </div>
              </div>
            )}
          </form>
        )}

        {/* ---------------------------------------------------- waiting */}
        {step === 'waiting' && (
          <div className="pay-waiting">
            <span className="pay-ic pulse">
              <Smartphone />
            </span>
            <h3>{isSandbox ? 'Confirming test payment…' : 'Check your phone'}</h3>
            <p className="pay-sub">
              {isSandbox ? (
                <>
                  Simulating a mobile-money approval for <b>{tzs(video.priceTzs)}</b> to{' '}
                  <b>{phone}</b>. This unlocks in a few seconds.
                </>
              ) : (
                <>
                  We sent a request for <b>{tzs(video.priceTzs)}</b> to <b>{phone}</b>. Enter your
                  PIN on the handset to approve it.
                </>
              )}
            </p>
            <div className="pay-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <small className="pay-note">
              Keep this page open — it unlocks the moment the payment clears.
            </small>
          </div>
        )}

        {/* ------------------------------------------------------- done */}
        {step === 'done' && (
          <div className="pay-done">
            <span className="pay-ic good">
              <BadgeCheck />
            </span>
            <h3>Unlocked</h3>
            <p className="pay-sub">
              <b>{video.title}</b> is yours permanently. It will always be in your library, on any
              device you sign in to.
            </p>
            <button className="btn btn-gold btn-block" onClick={onUnlocked}>
              <Play />
              Watch it now
            </button>
            <button className="btn btn-ghost btn-block" onClick={onGoToLibrary}>
              <Library />
              Go to my library
            </button>
          </div>
        )}

        {/* ----------------------------------------------------- failed */}
        {step === 'failed' && (
          <div className="pay-done pay-failed">
            <span className="pay-ic bad">
              <AlertTriangle />
            </span>
            <h3>Payment not completed</h3>
            <p className="pay-sub">{error || 'Something went wrong.'}</p>
            {payment?.status && <small className="pay-note">Status: {payment.status}</small>}
            <button className="btn btn-gold btn-block" onClick={() => setStep('form')}>
              Try again
            </button>
            <button className="btn btn-ghost btn-block" onClick={onClose}>
              Not now
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
