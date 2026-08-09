import { useNavigate } from 'react-router-dom'
import { ArrowRight, Crown } from 'lucide-react'
import Icon from '@/components/ui/Icon'
import { EARN_ITEMS, IMG } from '@/data/copy'
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
          <div className="earn-card">
            <div className="row">
              <small>Every sale is split like this</small>
              <b>{creatorShare}% to you</b>
            </div>
            <div className="split-bar">
              <span style={{ width: `${creatorShare}%` }} />
              <span />
            </div>
            <div className="split-legend">
              <span>
                Creator <b>{creatorShare}%</b>
              </span>
              <span>
                Platform <b>{100 - creatorShare}%</b>
              </span>
            </div>
          </div>
        </div>

        <div className="earn-content">
          <span className="badge">
            <Crown style={{ width: 14, height: 14 }} />
            FOR CREATORS
          </span>
          <h2>
            Your Content. Your Price. <span className="grad-text">Your Money.</span>
          </h2>
          <p>
            Stop giving your best work away for free. MTONYO+ flips the model — your fans pay
            first, then the world watches with ads. Either way, you earn.
          </p>

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

          <button className="btn btn-gold" onClick={() => navigate('/signup')}>
            <ArrowRight />
            Become a Creator — It&apos;s Free
          </button>
        </div>
      </div>
    </section>
  )
}
