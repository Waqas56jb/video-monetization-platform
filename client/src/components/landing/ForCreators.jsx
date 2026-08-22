import { useNavigate } from 'react-router-dom'
import { ArrowRight, Check, Crown, Smartphone } from 'lucide-react'
import Icon from '@/components/ui/Icon'
import { CREATOR_CONTROL, EARN_ITEMS, IMG } from '@/data/copy'
import useApi from '@/hooks/useApi'
import api from '@/lib/api'

export default function ForCreators() {
  const navigate = useNavigate()

  // The split shown here is the real one this platform runs on, read from the
  // settings the administrator controls — not a number painted into a mockup
  // that would quietly become a lie the day it was changed.
  const { data } = useApi(() => api.stats.platform(), [])
  const creatorShare = data?.creatorSplitPercent ?? 70

  return (
    <section
      className="section"
      id="creators"
      style={{ background: 'linear-gradient(180deg,transparent,rgba(245,197,24,.035),transparent)' }}
    >
      <div className="container earn-grid">
        <div className="earn-img">
          <img src={IMG.creator} alt="Creator" loading="lazy" decoding="async" />
          {/* The headline number stays on the picture; the working is below,
              where it has room to be followed. */}
          <div className="earn-badge">
            <b>{creatorShare}%</b>
            <small>of every sale is yours</small>
          </div>
        </div>

        <div className="earn-content">
          <span className="badge">
            <Crown style={{ width: 14, height: 14 }} />
            FOR CREATORS
          </span>
          <h2>
            Your Content. <span className="grad-text">Your Rules.</span>
          </h2>
          <p>
            Your audience pays first, then the world watches with ads. Either way, you earn — and
            every one of those decisions is yours.
          </p>

          {/**
           * The principle, stated plainly.
           *
           * The client was specific about this: MTONYO+ gives creators tools and
           * choices, it does not control their content. Four short lines saying
           * "you choose" carry that better than a paragraph explaining it.
           */}
          <ul className="control-list">
            {CREATOR_CONTROL.points.map((point) => (
              <li key={point}>
                <Check size={16} />
                {point}
              </li>
            ))}
          </ul>
          <p className="control-note">{CREATOR_CONTROL.footnote}</p>

          {/**
           * Where the money actually goes.
           *
           * This was a percentage bar, which shows a ratio but not a journey —
           * and the question a creator is really asking is "what happens to the
           * shilling my viewer just paid". So it is drawn as that: one payment,
           * arriving, then splitting.
           *
           * The split is read from platform settings, not painted in. If an
           * administrator changes it, this changes with it rather than quietly
           * becoming untrue.
           */}
          <div className="flow" role="img" aria-label={`A viewer's payment splits ${creatorShare}% to the creator and ${100 - creatorShare}% to the platform`}>
            <div className="flow-step">
              <Smartphone size={15} />
              <b>A viewer pays</b>
              <small>M-Pesa or Airtel Money</small>
            </div>

            <span className="flow-arrow" aria-hidden="true" />

            <div className="flow-split">
              <div className="flow-share is-creator" style={{ flexGrow: creatorShare }}>
                <b>{creatorShare}%</b>
                <small>You</small>
              </div>
              <div className="flow-share is-platform" style={{ flexGrow: 100 - creatorShare }}>
                <b>{100 - creatorShare}%</b>
                <small>Platform</small>
              </div>
            </div>

            <p className="flow-note">
              Credited the moment the payment clears — not at the end of a month.
            </p>
          </div>

          <div className="earn-list">
            {EARN_ITEMS.map((item) => (
              <div className="earn-item" key={item.title}>
                <span className="e-ic">
                  <Icon name={item.icon} />
                </span>
                <div>
                  <b>{item.title}</b>
                  <p>{item.text}</p>
                </div>
              </div>
            ))}
          </div>

          <button className="btn btn-gold" onClick={() => navigate('/signup?side=creator')}>
            <ArrowRight />
            Start Earning Today
          </button>
        </div>
      </div>
    </section>
  )
}
