import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  FlaskConical,
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

export default function PaymentModal({ open, video, onClose, onUnlocked }) {
  // Only ask while the dialog is open; there is no reason to poll otherwise.
  const { data: platform } = useApi(() => api.stats.platform(), [open], { skip: !open })
  const isSandbox = platform?.paymentProvider === 'sandbox'

  const [step, setStep] = useState('form') // form | waiting | failed
  const [method, setMethod] = useState('mpesa')
  /**
   * In sandbox the number is not charged and no such subscriber exists — it
   * only has to look like a number. Leaving the field empty made an empty
   * field the most likely way to fail a test payment, so it starts filled
   * with an obvious test number and can still be typed over.
   */
  const [phone, setPhone] = useState('')
  const [error, setError] = useState(null)
  const [payment, setPayment] = useState(null)
  const [simulateAs, setSimulateAs] = useState('success')
  const polling = useRef(null)

  useLockBodyScroll(open)

  useEffect(() => {
    if (open && isSandbox) setPhone((was) => was || '0712345678')
  }, [open, isSandbox])

  /**
   * The handover is held in a ref rather than depended on directly.
   *
   * `onUnlocked` is a useCallback on the watch page whose dependencies include
   * two useApi results, so its identity changes whenever either reloads. An
   * effect that listed it would be torn down mid-timer — cancelling the pending
   * handover — and re-created, and any guard against firing twice would then
   * stop the replacement being scheduled at all. Keying only on `step` means
   * the timer is created once, when payment settles, and survives.
   */
  const unlockRef = useRef(onUnlocked)
  const handedOff = useRef(false)
  useEffect(() => {
    unlockRef.current = onUnlocked
  }, [onUnlocked])

  /**
   * Paying is the decision. Watching must not need a second one.
   *
   * The client rejected an Unlocked / Watch it now screen after success. As
   * soon as the provider confirms, close this sheet and continue the same
   * video from the preview stop. No extra tap.
   */
  const handOff = () => {
    if (handedOff.current) return
    handedOff.current = true
    unlockRef.current?.()
  }

  useEffect(() => {
    if (open) return
    setStep('form')
    setError(null)
    setPayment(null)
    setSimulateAs('success')
    handedOff.current = false
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

  const dismiss = () => {
    onClose()
  }

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
          handOff()
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

  const pay = async (e, outcome = 'success') => {
    e.preventDefault()
    setError(null)

    if (!/^[0-9+\s-]{9,15}$/.test(phone.trim())) {
      return setError('Enter the mobile money number to charge')
    }

    setSimulateAs(outcome)
    setStep('waiting')
    try {
      const res = await api.payments.initiate({
        videoId: video.id,
        method,
        phone: phone.trim(),
        // Milestone 2 sandbox: the gold button succeeds; the test links below
        // force declined / cancelled so the failure screen can be demoed.
        // Real AirPay in Milestone 3 ignores `simulate`.
        ...(isSandbox ? { simulate: outcome } : {}),
      })
      setPayment(res.payment)
      watch(res.payment.id)
    } catch (err) {
      setError(err.message)
      setStep('failed')
    }
  }

  if (!open) return null

  // Portal to body so page transforms never break viewport centering on
  // Android / iOS / desktop (fixed + ancestor transform = wrong box).
  return createPortal(
    <div className="modal open pay-modal" role="dialog" aria-modal="true" aria-label="Unlock this video">
      <div className="modal-bg" onClick={() => step !== 'waiting' && dismiss()} />
      <div className="modal-card pay-card">
        {step !== 'waiting' && (
          <button className="modal-x" onClick={dismiss} aria-label="Close">
            <X />
          </button>
        )}

        {/* ------------------------------------------------------- form */}
        {step === 'form' && (
          <form onSubmit={pay} noValidate className="pay-form">
            <span className="pay-ic">
              <Zap />
            </span>
            <h3>Unlock &ldquo;{video.title}&rdquo;</h3>
            <p className="pay-sub">
              One payment of <b>{tzs(video.priceTzs)}</b>. It stays in your library, on
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
              autoComplete="tel"
              placeholder={isSandbox ? '0712 345 678' : '0712 000 000'}
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value)
                setError(null)
              }}
              onFocus={(e) => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' })}
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
                    Pay succeeds after about 3 seconds. To see the failure screen, use the
                    buttons below — the real M-Pesa / Airtel gateway comes in Milestone 3.
                  </span>
                  <div className="sandbox-outcomes">
                    <button type="button" onClick={(e) => pay(e, 'failed')}>
                      Test declined
                    </button>
                    <button type="button" onClick={(e) => pay(e, 'cancelled')}>
                      Test cancelled
                    </button>
                  </div>
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
            <h3>
              {isSandbox
                ? simulateAs === 'cancelled'
                  ? 'Simulating a cancelled prompt…'
                  : simulateAs === 'failed'
                    ? 'Simulating a declined prompt…'
                    : 'Confirming test payment…'
                : 'Check your phone'}
            </h3>
            <p className="pay-sub">
              {isSandbox ? (
                simulateAs === 'success' ? (
                  <>
                    Simulating a mobile-money approval for <b>{tzs(video.priceTzs)}</b> to{' '}
                    <b>{phone}</b>. This unlocks in a few seconds.
                  </>
                ) : (
                  <>
                    Simulating the phone {simulateAs === 'cancelled' ? 'cancelling' : 'declining'} a
                    request for <b>{tzs(video.priceTzs)}</b>. Nothing will be charged.
                  </>
                )
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

        {/* ----------------------------------------------------- failed */}
        {step === 'failed' && (
          <div className="pay-done pay-failed">
            <span className="pay-ic bad">
              <AlertTriangle />
            </span>
            <h3>
              {payment?.status === 'cancelled'
                ? 'Payment cancelled'
                : payment?.status === 'expired'
                  ? 'Payment timed out'
                  : 'Payment not completed'}
            </h3>
            <p className="pay-sub">{error || 'Something went wrong.'}</p>
            <p className="pay-sub">Nothing was charged. You can try again with the same number.</p>
            <button className="btn btn-gold btn-block" onClick={() => setStep('form')}>
              Try again
            </button>
            <button className="btn btn-ghost btn-block" onClick={onClose}>
              Not now
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
