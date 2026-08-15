import { Lock, Link2 } from 'lucide-react'

/**
 * Shown over the player after the free preview ends — not the payment sheet.
 * Tap the gate (or the Unlock now button under the player) to open checkout.
 *
 * The wording changes with the release model, because "unlock" means two
 * different things here. Paying for a Pay Once release buys a copy that stays
 * in your library; paying during a Paid Premiere buys the window, and the video
 * turns Free + Ads for everyone afterwards — while you keep it ad-free. A gate
 * that says the same thing for both is quietly misleading about the one the
 * viewer is actually buying.
 *
 * Note on the word "permanent": deliberately not used. The client asked for it
 * to be dropped everywhere a customer can read it — "stays in your library"
 * says the same thing without implying MTONYO+ is holding onto anything.
 */
const COPY = {
  ppv_forever: {
    label: 'Pay Once',
    line: 'Yours in your library, on every device',
  },
  paid_premiere: {
    label: 'Paid Premiere',
    line: 'Unlock during the premiere — and keep it ad-free after',
  },
}

export default function LockGate({ priceLabel, accessType, onUnlock }) {
  const model = COPY[accessType] || null

  return (
    <button
      type="button"
      className="lock-gate"
      onClick={onUnlock}
      aria-label={`Unlock this video${priceLabel ? ` for ${priceLabel}` : ''}`}
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
        {model && <span className="lg-model">{model.label}</span>}
        <b>UNLOCK{priceLabel ? ` · ${priceLabel}` : ''}</b>
        <small>{model ? model.line : 'Preview ended · tap to continue'}</small>
      </span>
    </button>
  )
}
