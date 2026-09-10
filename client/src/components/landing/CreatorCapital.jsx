import { useNavigate } from 'react-router-dom'
import { ArrowRight, Landmark, ShieldCheck } from 'lucide-react'
import { useRole } from '@/context/AuthContext'

/**
 * Creator Capital™ — AirPay reviews and decides, no lending engine here.
 *
 * Copy here is the client's own, verbatim — title, tagline, subtext and
 * both button labels are not placeholders. "Learn More" goes to the static
 * explainer; "Build Eligibility" goes straight to a signed-in creator's own
 * Creator Capital tab, or to Create signup for anyone else, the same
 * pattern ForCreators' own CTA already uses.
 */
export default function CreatorCapital() {
  const navigate = useNavigate()
  const { authed, isCreator } = useRole()

  const buildEligibility = () => {
    if (authed && isCreator) return navigate('/dashboard?tab=capital')
    navigate('/signup?side=creator')
  }

  return (
    <section
      className="section"
      id="creator-capital"
      style={{ background: 'linear-gradient(180deg,transparent,rgba(112,0,255,.05),transparent)' }}
    >
      <div className="container" style={{ maxWidth: 760, textAlign: 'center' }}>
        <span className="badge">
          <Landmark style={{ width: 14, height: 14 }} />
          CREATOR CAPITAL™
        </span>
        <h2 style={{ marginTop: 16 }}>Create. Earn. Build Your Record. Unlock Capital.</h2>
        <p style={{ color: 'var(--muted)', fontSize: 17, lineHeight: 1.7, margin: '14px auto 26px' }}>
          Build 6 months of verified MTONYO+ transaction history and become eligible for Creator
          Capital review in partnership with AirPay.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" type="button" onClick={() => navigate('/creator-capital')}>
            Learn More
          </button>
          <button className="btn btn-gold" type="button" onClick={buildEligibility}>
            <ArrowRight size={16} />
            Build Eligibility
          </button>
        </div>
        <p className="capital-disclaimer" style={{ justifyContent: 'center', marginTop: 22, border: 'none', paddingTop: 0 }}>
          <ShieldCheck size={13} aria-hidden="true" />
          MTONYO+ is not the lender — AirPay Microfinance decides eligibility, approval and financing
          terms.
        </p>
      </div>
    </section>
  )
}
