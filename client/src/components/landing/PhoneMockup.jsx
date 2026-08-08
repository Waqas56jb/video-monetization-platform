import { Lock, Zap } from 'lucide-react'
import { IMG } from '@/data/content'

/** The floating phone with the live paywall preview inside the hero. */
export default function PhoneMockup({ onUnlock }) {
  return (
    <div className="phone">
      <div className="phone-notch" />
      <div className="phone-screen">
        <img src={IMG.premiere} alt="Premiere" loading="lazy" />
        <div className="ph-overlay">
          <span className="ph-live">PAID PREMIERE</span>
          <div>
            <div className="ph-title">Harmonize — Behind The Fame</div>
            <div className="ph-artist">Music · Documentary</div>
            <div className="ph-progress">
              <span />
            </div>
          </div>
        </div>
        <div className="ph-body">
          <div className="ph-lock">
            <Lock />
            <small>
              <b>Want to keep watching?</b>You&apos;ve watched 5:00 of 20:00 free
            </small>
          </div>
          <button className="ph-pay" onClick={onUnlock}>
            <Zap />
            UNLOCK FULL VIDEO · TZS 500
          </button>
          <div className="ph-methods">
            <span>M-PESA</span>
            <span>AIRTEL MONEY</span>
          </div>
        </div>
      </div>
    </div>
  )
}
