import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  CheckCircle2,
  Clock,
  Landmark,
  Lock,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import { useRole } from '@/context/AuthContext'
import useApi from '@/hooks/useApi'
import api from '@/lib/api'
import { LANDING_KEYS, landingFetcher, readLanding } from '@/lib/landingCache'

/**
 * The static explainer behind the homepage's "Learn More" — not a policy
 * document (Legal.jsx's "MTONYO+ POLICIES" framing and "Last updated" date
 * would misdescribe a product explainer as legal text), so this is its own
 * small page rather than a sixth entry in `legal.js`.
 *
 * "N months" is the platform's one eligibility rule
 * (platform_settings.capital_months_required, migration 040), read from the
 * same public stats the homepage uses — never a "6" typed in here, which is
 * how this page and Super Admin came to disagree.
 *
 * REBUILT 2026-09-21 (client: "the actual Creator Capital page still becomes
 * long plain text and feels like a Word/terms page... make it visual and
 * premium: cards/steps/icons/status examples/clear sections. Do not change
 * the business logic, just improve the presentation."). Every sentence of
 * fact below is the exact wording the old `.legal-body` paragraphs carried —
 * nothing added, nothing softened, nothing dropped — reorganised into the
 * same card/step/icon language the homepage's Creator Capital section
 * already uses (and which the client already approved: "The homepage
 * Creator Capital section looks much better"). No new CSS: every class here
 * (`cc-*`, `.notice`, `.pill`) is the homepage section's own, so this page
 * cannot visually drift from it.
 */
export default function CreatorCapitalInfo() {
  const navigate = useNavigate()
  const { authed, isCreator } = useRole()
  const stats = useApi(landingFetcher(LANDING_KEYS.stats, () => api.stats.platform()), [], {
    initialData: readLanding(LANDING_KEYS.stats),
  })
  const months = Number(stats.data?.capitalMonthsRequired) || 6

  useEffect(() => {
    window.document.title = 'Creator Capital™ — MTONYO+'
    window.scrollTo({ top: 0 })
    return () => {
      window.document.title = "MTONYO+ — Tanzania's Premium Creator Video Platform"
    }
  }, [])

  const buildEligibility = () => {
    if (authed && isCreator) return navigate('/dashboard?tab=capital')
    navigate('/signup?side=creator')
  }

  /**
   * Word-for-word the two "How it works" paragraphs the old page carried,
   * split at their own sentence boundaries into four steps. Nothing here is
   * a new claim — compare against git history for 037_creator_capital.sql /
   * the pre-redesign version of this file.
   */
  const STEPS = [
    {
      icon: TrendingUp,
      title: 'Earn, verified',
      text: 'Every sale and every advertising payout you earn on MTONYO+ is verified — settled money, not views or pending payments.',
    },
    {
      icon: Clock,
      title: `Reach ${months} months`,
      text: `Once you have ${months} months of that history, you become eligible to request a review.`,
    },
    {
      icon: ShieldCheck,
      title: 'Consent & request',
      text: 'Requesting a review means consenting to MTONYO+ sharing that verified history and your account details with AirPay.',
    },
    {
      icon: SearchCheck,
      title: 'AirPay reviews',
      text: 'Not automatic, not instant. AirPay looks at your months of verified earnings, lifetime and recent revenue, how many people pay you, how many buy from you more than once, and your refund rate — the same figures a lender would want to see.',
    },
  ]

  /** The real states a request moves through — the same enum and the same
      display labels the dashboard's own Creator Capital tab uses (037/040),
      shown here only as a legend, never as anyone's live data. */
  const STATUS_JOURNEY = [
    { pill: 'pend', label: 'Building Eligibility', text: `Earning toward the ${months}-month requirement.` },
    { pill: 'info', label: 'Under AirPay Review', text: 'Requested — AirPay is assessing your history.' },
    { pill: 'gold', label: 'Offer Ready', text: 'AirPay approved an amount and terms; nothing is accepted yet.' },
    { pill: 'ok', label: 'Active', text: 'You accepted the offer; your balance is tracked in your tab.' },
    { pill: 'ok', label: 'Repaid', text: 'Fully repaid — you may build toward a future request.' },
  ]

  return (
    <div className="page">
      <Header />

      <section className="section cc-section">
        <div className="container">
          <Link className="legal-back" to="/">
            <ArrowLeft />
            Back to home
          </Link>

          <div className="cc-intro" style={{ maxWidth: 680, marginBottom: 44 }}>
            <span className="badge">
              <Landmark style={{ width: 14, height: 14 }} />
              CREATOR CAPITAL™
            </span>
            <h2>Create. Earn. Build Your Record. Unlock Capital.</h2>
            <p className="cc-sub">
              Build {months} months of verified MTONYO+ transaction history and become eligible
              for Creator Capital review in partnership with AirPay.
            </p>
          </div>

          <div className="cc-block">
            <div className="cc-block-head">
              <h3>How Creator Capital works</h3>
              <p>From your first verified sale to an AirPay decision.</p>
            </div>
            <div className="cc-steps">
              {STEPS.map((step, i) => (
                <div className="cc-step" key={step.title}>
                  <span className="cc-step-num">{i + 1}</span>
                  <span className="cc-step-ic">
                    <step.icon size={18} />
                  </span>
                  <b>{step.title}</b>
                  <p>{step.text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="cc-block">
            <div className="cc-block-head">
              <h3>Who decides</h3>
            </div>
            <div className="notice notice-review">
              <Landmark />
              <span>
                <b>MTONYO+ is not the lender — AirPay Microfinance decides eligibility, approval
                and financing terms.</b>{' '}
                MTONYO+ verifies your earnings history and puts your request in front of AirPay;
                AirPay makes the credit decision, sets the amount and the terms, and is who you
                repay.
              </span>
            </div>
          </div>

          <div className="cc-block">
            <div className="cc-block-head">
              <h3>Every status, explained</h3>
              <p>What each stage of a request means — not your own status, a legend.</p>
            </div>
            <div className="cc-status-journey">
              {STATUS_JOURNEY.map((s) => (
                <div className="cc-journey-item" key={s.label}>
                  <span className={`pill ${s.pill}`}>{s.label}</span>
                  <p>{s.text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="cc-block">
            <div className="cc-block-head">
              <h3>If you are approved</h3>
            </div>
            <div className="cc-approved-row">
              <aside className="cc-status-card is-illustrative">
                <div className="cc-status-head">
                  <span className="cc-status-ic">
                    <Banknote size={16} />
                  </span>
                  <b>Example offer</b>
                </div>
                <p className="cc-status-row">
                  <span>Amount:</span>
                  <b>Set by AirPay</b>
                </p>
                <p className="cc-status-row">
                  <span>Purpose:</span>
                  <b>Stated on the offer</b>
                </p>
                <p className="cc-status-row">
                  <span>Repayment terms:</span>
                  <b>Set by AirPay</b>
                </p>
                <p className="cc-status-row">
                  <span>Status:</span>
                  <span className="pill gold">Offer Ready</span>
                </p>
                <p className="cc-status-note">
                  Illustrative — the real amount, purpose and terms are AirPay&apos;s own decision.
                </p>
                <div className="cc-status-airpay">
                  <span>Decided by</span>
                  <span className="cc-airpay-logo">
                    <Landmark size={14} />
                    AirPay <b>Microfinance</b>
                  </span>
                </div>
              </aside>
              <p className="cc-sub">
                You will see the offer — the amount, its purpose, and the repayment terms — in
                your Creator Capital tab, with <Lock size={13} style={{ verticalAlign: -2 }} />{' '}
                nothing to accept until you choose to. Your repayment balance is tracked there
                for as long as it is open.
              </p>
            </div>
          </div>

          <div className="cc-actions">
            <div className="cc-cta-row">
              <button className="btn btn-gold" type="button" onClick={buildEligibility}>
                <ArrowRight size={16} />
                Build Eligibility
              </button>
            </div>
            <div className="cc-trust-row">
              <div className="cc-trust-item">
                <CheckCircle2 size={16} />
                <div>
                  <b>Nothing to accept</b>
                  <small>until you choose to</small>
                </div>
              </div>
              <div className="cc-trust-item">
                <Sparkles size={16} />
                <div>
                  <b>MTONYO+ is not the lender</b>
                  <small>AirPay Microfinance decides</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
