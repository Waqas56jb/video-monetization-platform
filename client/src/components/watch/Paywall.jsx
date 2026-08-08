import { LockKeyhole, ShieldCheck, Zap } from 'lucide-react'

/** Blurred lock overlay that appears the moment the free preview runs out. */
export default function Paywall({ show, price, watched, onUnlock }) {
  return (
    <div className={`paywall ${show ? 'show' : ''}`.trim()} aria-hidden={!show}>
      <div className="paywall-card">
        <div className="pw-lock">
          <LockKeyhole />
        </div>
        <h3>Want to keep watching?</h3>
        <p className="pw-watched">{watched}</p>
        <p>
          Unlock the full video instantly with mobile money. It stays in your library{' '}
          <b style={{ color: '#fff' }}>forever</b>.
        </p>
        <div className="pw-price">
          {price} <small>one-time</small>
        </div>
        <button className="btn btn-gold btn-block" onClick={onUnlock}>
          <Zap />
          Unlock Full Video
        </button>
        <div className="secure-note">
          <ShieldCheck />
          Secure payment via M-Pesa or Airtel Money
        </div>
      </div>
    </div>
  )
}
