import { useState } from 'react'
import { Landmark, ShieldCheck } from 'lucide-react'
import Panel from '../Panel'
import { ErrorState, Skeleton } from '@/components/ui/States'
import useApi, { tzs } from '@/hooks/useApi'
import api from '@/lib/api'
import { useToast } from '@/context/ToastContext'

/**
 * Creator Capital — AirPay reviews and decides, no lending engine here.
 *
 * MTONYO+ never decides who is approved or for how much; AirPay does, once
 * a creator has enough verified history to be worth reviewing. Everything
 * this tab shows is a status — building eligibility, waiting on a decision,
 * an offer to accept, or a balance being repaid — never a calculation this
 * platform performs on its own.
 *
 * `building` carries two distinct labels over one status, not two statuses:
 * "Building Eligibility" before the months threshold, "Eligibility
 * Unlocked" / "Ready for AirPay Review" after it — both derived from
 * monthsWithEarnings vs monthsRequired, which the API already returns, so
 * no new persisted state or migration was needed for either label
 * (report2.txt §2).
 */
const DISCLAIMER =
  'MTONYO+ is not the lender — AirPay Microfinance decides eligibility, approval and financing terms.'

export default function CreatorCapitalTab() {
  const showToast = useToast()
  const { data, loading, error, reload } = useApi(() => api.capital.status(), [])
  const [busy, setBusy] = useState(false)
  /**
   * Requesting a review means MTONYO+ hands AirPay the creator's verified
   * earnings and account details. That is the creator's to give, so it is
   * asked for here, in words, and sent with the request — the server refuses
   * a request that does not carry it (client's Sep 17 review, item 5).
   */
  const [consent, setConsent] = useState(false)

  if (loading) return <Skeleton rows={4} />
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!data) return <ErrorState error={{ message: 'Creator Capital could not be loaded.' }} onRetry={reload} />

  const capital = data.capital
  const monthsWithEarnings = data.monthsWithEarnings || 0
  /* One rule, from platform_settings.capital_months_required — never a local
     copy of "6" (migration 040). The fallback only covers a missing field. */
  const monthsRequired = data.monthsRequired || 6
  const status = capital?.status || 'building'

  const act = async (fn, message) => {
    setBusy(true)
    try {
      await fn()
      showToast(message)
      reload({ quiet: true })
    } catch (err) {
      showToast(err.message)
    } finally {
      setBusy(false)
    }
  }

  const requestReview = () =>
    act(() => api.capital.requestReview({ consent }), 'Requested — AirPay will review your verified history')
  const acceptOffer = () => act(() => api.capital.acceptOffer(), 'Offer accepted')

  return (
    <div className="tab">
      <Panel
        title="Creator Capital™"
        action={
          <span className="badge">
            <Landmark style={{ width: 14, height: 14 }} />
            AIRPAY MICROFINANCE
          </span>
        }
      >
        {status === 'building' && (
          <div className="capital-state">
            {monthsWithEarnings >= monthsRequired ? (
              <>
                <h4>Eligibility Unlocked</h4>
                <span className="badge" style={{ marginBottom: 4 }}>
                  Ready for AirPay Review
                </span>
              </>
            ) : (
              <h4>Building Eligibility</h4>
            )}
            <p>
              {monthsWithEarnings} of {monthsRequired} months of verified earnings.
            </p>
            <div className="capital-progress" role="progressbar" aria-valuenow={monthsWithEarnings} aria-valuemin={0} aria-valuemax={monthsRequired}>
              {Array.from({ length: monthsRequired }).map((_, i) => (
                <span key={i} className={`capital-segment ${i < monthsWithEarnings ? 'is-filled' : ''}`.trim()} />
              ))}
            </div>
            <p className="field-hint">
              Verified earnings are settled sales and ad revenue that have already cleared to your
              account — not views, not pending payments.
            </p>
            {monthsWithEarnings >= monthsRequired && (
              <label className="check-row capital-consent">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  disabled={busy}
                />
                <span>
                  I consent to MTONYO+ sharing my verified earnings history and relevant account
                  details with AirPay Microfinance for this review
                  <small>
                    What is shared: your months of verified earnings, lifetime and recent revenue,
                    paying and repeat buyers, refund rate, and the name and contact details on your
                    creator account — for AirPay&apos;s review of this request and nothing else.
                    AirPay makes the decision; MTONYO+ is not the lender.
                  </small>
                </span>
              </label>
            )}
            <button
              className="btn btn-gold"
              type="button"
              disabled={busy || monthsWithEarnings < monthsRequired || !consent}
              onClick={requestReview}
            >
              Request AirPay Review
            </button>
            {monthsWithEarnings < monthsRequired ? (
              <p className="field-hint">
                Request AirPay Review unlocks once you reach {monthsRequired} months of verified earnings.
              </p>
            ) : (
              !consent && <p className="field-hint">Tick the consent above to send your request.</p>
            )}
          </div>
        )}

        {status === 'under_review' && (
          <div className="capital-state">
            <h4>Under AirPay Review</h4>
            <p>AirPay is reviewing your verified earnings history. This is not instant — check back here for a decision.</p>
            {/* The request itself is the proof it went in — no second button,
                so a second request cannot be sent from here while this one
                is pending (client's Sep 17 review, item 3). */}
            <p className="field-hint">
              Requested {capital?.requestedAt ? new Date(capital.requestedAt).toLocaleDateString() : 'recently'}
              {capital?.consentAt ? ' · data-sharing consent recorded' : ''}. One request at a time — you
              cannot send another while this one is open.
            </p>
          </div>
        )}

        {status === 'approved' && (
          <div className="capital-state">
            <h4>You have an offer</h4>
            <dl className="capital-terms">
              <dt>Amount</dt>
              <dd>{tzs(capital.approvedAmountTzs)}</dd>
              {capital.purpose && (
                <>
                  <dt>Purpose</dt>
                  <dd>{capital.purpose}</dd>
                </>
              )}
              {capital.repaymentTerms && (
                <>
                  <dt>Repayment terms</dt>
                  <dd>{capital.repaymentTerms}</dd>
                </>
              )}
            </dl>
            <button className="btn btn-gold" type="button" disabled={busy} onClick={acceptOffer}>
              Accept Offer
            </button>
          </div>
        )}

        {status === 'active' && (
          <div className="capital-state">
            <h4>Active</h4>
            <div className="capital-terms">
              <div className="capital-bar-row">
                <b>{tzs(capital.amountRepaidTzs)} repaid</b>
                <span>{tzs(capital.remainingBalanceTzs)} remaining</span>
              </div>
              <div className="capital-bar">
                <div
                  className="capital-bar-fill"
                  style={{
                    width: `${Math.min(100, Math.round((100 * (capital.amountRepaidTzs || 0)) / Math.max(1, capital.approvedAmountTzs || 1)))}%`,
                  }}
                />
              </div>
              <p className="field-hint">of {tzs(capital.approvedAmountTzs)} approved</p>
            </div>
          </div>
        )}

        {status === 'repaid' && (
          <div className="capital-state">
            <h4>Fully repaid</h4>
            <p>This Creator Capital record is closed. Thank you.</p>
          </div>
        )}

        {(status === 'declined' || status === 'paused') && (
          <div className="capital-state">
            <h4>{status === 'declined' ? 'Request declined' : 'Repayment paused'}</h4>
            {capital?.repaymentTerms && <p>{capital.repaymentTerms}</p>}
          </div>
        )}

        <p className="capital-disclaimer">
          <ShieldCheck size={13} aria-hidden="true" />
          {DISCLAIMER}
        </p>
      </Panel>
    </div>
  )
}
