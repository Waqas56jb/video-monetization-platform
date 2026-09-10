import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Landmark, ShieldCheck } from 'lucide-react'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import { useRole } from '@/context/AuthContext'

/**
 * The static explainer behind the homepage's "Learn More" — not a policy
 * document (Legal.jsx's "MTONYO+ POLICIES" framing and "Last updated" date
 * would misdescribe a product explainer as legal text), so this is its own
 * small page rather than a sixth entry in `legal.js`.
 */
export default function CreatorCapitalInfo() {
  const navigate = useNavigate()
  const { authed, isCreator } = useRole()

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

  return (
    <div className="page">
      <Header />

      <section className="legal">
        <div className="container">
          <Link className="legal-back" to="/">
            <ArrowLeft />
            Back to home
          </Link>

          <div className="legal-head">
            <span className="badge">
              <Landmark style={{ width: 14, height: 14 }} />
              CREATOR CAPITAL™
            </span>
            <h1>Create. Earn. Build Your Record. Unlock Capital.</h1>
            <p>
              Build 6 months of verified MTONYO+ transaction history and become eligible for
              Creator Capital review in partnership with AirPay.
            </p>
          </div>

          <article className="legal-body">
            <section>
              <h2>How it works</h2>
              <p>
                Every sale and every advertising payout you earn on MTONYO+ is verified — settled
                money, not views or pending payments. Once you have six months of that history,
                you can request a review.
              </p>
              <p>
                A review is not automatic and is not instant. It looks at your months of verified
                earnings, your lifetime and recent revenue, how many people pay you, how many buy
                from you more than once, and your refund rate — the same figures a lender would
                want to see.
              </p>
            </section>
            <section>
              <h2>Who decides</h2>
              <p>
                <strong>
                  MTONYO+ is not the lender — AirPay Microfinance decides eligibility, approval and
                  financing terms.
                </strong>{' '}
                MTONYO+ verifies your earnings history and puts your request in front of AirPay;
                AirPay makes the credit decision, sets the amount and the terms, and is who you
                repay.
              </p>
            </section>
            <section>
              <h2>If you are approved</h2>
              <p>
                You will see the offer — the amount, its purpose, and the repayment terms — in
                your Creator Capital tab, with nothing to accept until you choose to. Your
                repayment balance is tracked there for as long as it is open.
              </p>
            </section>
          </article>

          <div className="legal-cta">
            <button className="btn btn-gold" type="button" onClick={buildEligibility}>
              <ArrowRight size={16} />
              Build Eligibility
            </button>
            <p className="capital-disclaimer" style={{ marginTop: 14 }}>
              <ShieldCheck size={13} aria-hidden="true" />
              MTONYO+ is not the lender — AirPay Microfinance decides eligibility, approval and
              financing terms.
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
