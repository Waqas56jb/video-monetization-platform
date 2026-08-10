import { LockKeyhole, Zap } from 'lucide-react'

/**
 * Paywall shown directly over the player the moment the creator's free-preview
 * time runs out. Copy and order are the client's exact wording:
 *
 *   Want to keep watching?
 *   You've reached the end of your free preview.
 *   TZS 500
 *   One payment • Stays in your library
 *   UNLOCK & CONTINUE — TZS 500
 *   M-Pesa • Airtel Money
 *
 * Everything must be reachable without scrolling on a phone, so the layout is
 * deliberately compact and the CTA is never pushed below the fold.
 */
export default function Paywall({ show, price, onUnlock, onDismiss }) {
  return (
    <div className={`paywall ${show ? 'show' : ''}`.trim()} aria-hidden={!show}>
      <div className="paywall-card">
        <div className="pw-lock">
          <LockKeyhole />
        </div>

        <h3>Want to keep watching?</h3>
        <p className="pw-sub">You&apos;ve reached the end of your free preview.</p>

        <div className="pw-price">{price}</div>
        <p className="pw-terms">One payment • Stays in your library</p>

        <button className="btn btn-gold btn-block pw-cta" onClick={onUnlock}>
          <Zap />
          UNLOCK &amp; CONTINUE — {price}
        </button>

        <div className="pw-methods">M-Pesa • Airtel Money</div>

        {/* A paywall must never be a dead end — the viewer can always back out
            and keep browsing. Pressing play again brings it straight back. */}
        <button className="pw-later" onClick={onDismiss}>
          Not now — keep browsing
        </button>
      </div>
    </div>
  )
}
