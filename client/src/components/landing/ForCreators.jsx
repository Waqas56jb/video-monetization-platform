import { useNavigate } from 'react-router-dom'
import { ArrowRight, Crown } from 'lucide-react'
import Reveal from '@/components/ui/Reveal'
import Icon from '@/components/ui/Icon'
import { EARN_ITEMS, IMG } from '@/data/content'

export default function ForCreators() {
  const navigate = useNavigate()

  return (
    <section
      className="section"
      id="creators"
      style={{ background: 'linear-gradient(180deg,transparent,rgba(245,197,24,.035),transparent)' }}
    >
      <div className="container earn-grid">
        <Reveal className="earn-img" variant="left">
          <img src={IMG.creator} alt="Creator" loading="lazy" />
          <div className="earn-card">
            <div className="row">
              <small>This month&apos;s earnings</small>
              <b>+ TZS 8,745,000</b>
            </div>
            <div className="split-bar">
              <span />
              <span />
            </div>
            <div className="split-legend">
              <span>
                Creator <b>70%</b>
              </span>
              <span>
                Platform <b>30%</b>
              </span>
            </div>
          </div>
        </Reveal>

        <Reveal className="earn-content" variant="right">
          <span className="badge">
            <Crown style={{ width: 14, height: 14 }} />
            FOR CREATORS
          </span>
          <h2>
            Your Content. Your Price. <span className="grad-text">Your Money.</span>
          </h2>
          <p>
            Stop giving your best work away for free. CreatorTZ flips the model — your fans pay
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
        </Reveal>
      </div>
    </section>
  )
}
