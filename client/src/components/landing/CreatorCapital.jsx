import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Camera,
  Clapperboard,
  Gem,
  Heart,
  Landmark,
  Megaphone,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Unlock,
  Wallet,
  Wrench,
} from 'lucide-react'
import { useRole } from '@/context/AuthContext'
import useApi from '@/hooks/useApi'
import api from '@/lib/api'

/**
 * Creator Capital™ — AirPay reviews and decides, no lending engine here.
 *
 * Rebuilt full-width for the Sep 09 mockup (report2.txt §3): was a slim,
 * 760px-capped banner sitting well after Trending; now a full section
 * positioned immediately before it. Labels on the status card match the
 * same building/unlocked split §2 put in the dashboard tab — one status,
 * two labels, no new persisted state.
 */
const DISCLAIMER =
  'MTONYO+ is not the lender — AirPay Microfinance decides eligibility, approval and financing terms.'

const STEPS = [
  {
    icon: TrendingUp,
    title: 'Build earnings history',
    text: 'Upload, monetize and build verified earnings on MTONYO+.',
  },
  {
    icon: Unlock,
    title: 'Unlock eligibility',
    text: 'Meet the required earnings history and creator criteria.',
  },
  {
    icon: SearchCheck,
    title: 'AirPay reviews',
    text: 'AirPay Microfinance reviews your application and eligibility.',
  },
  {
    icon: Wallet,
    title: 'Get funded',
    text: 'Receive production funding to grow your content.',
  },
]

const FUNDING_USES = [
  { icon: Camera, title: 'Production Funding', text: 'Turn ideas into bigger projects.' },
  { icon: Wrench, title: 'Equipment', text: 'Cameras, audio, lights and more.' },
  { icon: Clapperboard, title: 'Filming & Editing', text: 'Better tools. Higher quality.' },
  { icon: Megaphone, title: 'Marketing & Promotion', text: 'Reach more viewers in Tanzania and beyond.' },
]

const TRUST = [
  { icon: ShieldCheck, title: 'Performance-based', text: 'Your success drives opportunity.' },
  { icon: Gem, title: 'Transparent', text: 'Clear process, no hidden fees.' },
  { icon: Heart, title: 'Creator-first', text: 'Built for Tanzanian creators.' },
]

/**
 * AirPay's real logo file has not arrived from the client yet (report2.txt
 * §3). This renders in its place — same slot, same sizing — so dropping in
 * `<img src={airpayLogoUrl} alt="AirPay Microfinance" />` later is a
 * one-line swap, not a layout change.
 */
function AirPayLogoPlaceholder() {
  return (
    <span className="cc-airpay-logo" aria-label="AirPay Microfinance">
      <Landmark size={14} />
      AirPay <b>Microfinance</b>
    </span>
  )
}

/** One label over the "building" status — see CreatorCapitalTab.jsx's own comment for why. */
function buildingLabel(monthsWithEarnings, monthsRequired) {
  return monthsWithEarnings >= monthsRequired ? 'Eligibility Unlocked' : 'Building Eligibility'
}

const STATUS_LABEL = {
  under_review: 'Under AirPay Review',
  approved: 'Offer Ready',
  active: 'Active',
  repaid: 'Repaid',
  declined: 'Declined',
  paused: 'Paused',
}

/**
 * Real status for a signed-in creator, a static illustrative example for
 * everyone else — same card shape either way, so nothing shifts on load
 * (CLS: the skeleton and the loaded card share one fixed-height frame).
 */
function StatusCard() {
  const { authed, isCreator } = useRole()
  const live = authed && isCreator
  const { data, loading } = useApi(() => api.capital.status(), [], { skip: !live })

  if (!live || loading || !data) {
    // Visitors, logged-out, non-creators, and the brief loading window for a
    // real creator all share this: a clearly-labelled illustrative example,
    // never presented as anyone's real figures.
    return (
      <aside className="cc-status-card is-illustrative">
        <div className="cc-status-head">
          <span className="cc-status-ic">
            <TrendingUp size={16} />
          </span>
          <b>Creator Capital Status</b>
        </div>
        <p className="cc-status-row">
          <span>Verified earnings history:</span>
          <b>6 months</b>
        </p>
        <p className="cc-status-row">
          <span>Status:</span>
          <span className="cc-status-pills">
            <span className="pill-gold">Building Eligibility</span>
            <span className="pill-green">Eligibility Unlocked</span>
          </span>
        </p>
        <div className="capital-bar">
          <div className="capital-bar-fill" style={{ width: '60%' }} />
        </div>
        <p className="cc-status-sub">60% complete</p>
        <div className="cc-status-uses">
          <Camera size={14} />
          <span>Use your funding for: Camera, Editing, Promotion</span>
        </div>
        <div className="cc-status-airpay">
          <span>Powered with</span>
          <AirPayLogoPlaceholder />
        </div>
        <p className="cc-status-note">Illustrative example — sign in as a creator to see your own status.</p>
      </aside>
    )
  }

  const capital = data.capital
  const monthsWithEarnings = data.monthsWithEarnings || 0
  const monthsRequired = data.monthsRequired || 6
  const status = capital?.status || 'building'
  const label = status === 'building' ? buildingLabel(monthsWithEarnings, monthsRequired) : STATUS_LABEL[status] || status
  const pct = Math.min(100, Math.round((monthsWithEarnings / Math.max(1, monthsRequired)) * 100))

  return (
    <aside className="cc-status-card">
      <div className="cc-status-head">
        <span className="cc-status-ic">
          <TrendingUp size={16} />
        </span>
        <b>Creator Capital Status</b>
      </div>
      <p className="cc-status-row">
        <span>Verified earnings history:</span>
        <b>{monthsWithEarnings} months</b>
      </p>
      <p className="cc-status-row">
        <span>Status:</span>
        <span className="pill-gold">{label}</span>
      </p>
      <div className="capital-bar">
        <div className="capital-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="cc-status-sub">{pct}% complete</p>
      <div className="cc-status-airpay">
        <span>Powered with</span>
        <AirPayLogoPlaceholder />
      </div>
    </aside>
  )
}

export default function CreatorCapital() {
  const navigate = useNavigate()
  const { authed, isCreator } = useRole()

  const buildEligibility = () => {
    if (authed && isCreator) return navigate('/dashboard?tab=capital')
    navigate('/signup?side=creator')
  }

  return (
    <section className="section cc-section" id="creator-capital">
      <div className="container">
        <div className="cc-top">
          <div className="cc-intro">
            <span className="badge">
              <Landmark style={{ width: 14, height: 14 }} />
              CREATOR CAPITAL
            </span>
            <h2>
              MTONYO+ <span className="grad-text">Creator Capital™</span>
            </h2>
            <p className="cc-tagline">Turn your earnings history into production funding.</p>
            <p className="cc-sub">
              Creators who build verified earnings on MTONYO+ may become eligible for production
              financing through AirPay Microfinance.
            </p>
            <p className="capital-disclaimer" style={{ marginTop: 18 }}>
              <ShieldCheck size={13} aria-hidden="true" />
              {DISCLAIMER}
            </p>
          </div>

          <StatusCard />
        </div>

        <div className="cc-block">
          <div className="cc-block-head">
            <h3>How Creator Capital Works</h3>
            <p>A simple process. Real opportunities.</p>
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
            <h3>Use your funding for</h3>
          </div>
          <div className="cc-tiles">
            {FUNDING_USES.map((use) => (
              <div className="cc-tile" key={use.title}>
                <span className="cc-tile-ic">
                  <use.icon size={18} />
                </span>
                <b>{use.title}</b>
                <p>{use.text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="cc-actions">
          <div className="cc-cta-row">
            <button className="btn btn-gold" type="button" onClick={() => navigate('/creator-capital')}>
              <Sparkles size={16} />
              Learn How It Works
            </button>
            <button className="btn btn-ghost" type="button" onClick={buildEligibility}>
              <ArrowRight size={16} />
              Start Building Eligibility
            </button>
          </div>
          <div className="cc-trust-row">
            {TRUST.map((t) => (
              <div className="cc-trust-item" key={t.title}>
                <t.icon size={16} />
                <div>
                  <b>{t.title}</b>
                  <small>{t.text}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
