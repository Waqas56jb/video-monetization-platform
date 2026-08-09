import { Lock, Link2 } from 'lucide-react'

/**
 * Shown over the player after the free preview ends — not the payment sheet.
 * Tap the gate (or the Unlock now button under the player) to open checkout.
 */
export default function LockGate({ priceLabel, onUnlock }) {
  return (
    <button
      type="button"
      className="lock-gate"
      onClick={onUnlock}
      aria-label="Unlock this video"
    >
      <span className="lg-veil" aria-hidden="true" />
      <span className="lg-chains" aria-hidden="true">
        <span className="lg-chain lg-chain-a">
          <Link2 />
          <Link2 />
          <Link2 />
        </span>
        <span className="lg-chain lg-chain-b">
          <Link2 />
          <Link2 />
          <Link2 />
        </span>
      </span>

      <span className="lg-lock">
        <Lock strokeWidth={2.2} />
        <span className="lg-ring" />
      </span>

      <span className="lg-copy">
        <b>UNLOCK</b>
        <small>Preview ended · tap to continue{priceLabel ? ` · ${priceLabel}` : ''}</small>
      </span>
    </button>
  )
}
