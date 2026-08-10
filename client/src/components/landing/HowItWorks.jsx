import { Route } from 'lucide-react'
import Icon from '@/components/ui/Icon'
import { STEPS, ACCESS_OPTIONS } from '@/data/copy'

export default function HowItWorks() {
  return (
    <section
      className="section"
      id="how"
      style={{ background: 'linear-gradient(180deg,transparent,rgba(124,58,237,.05),transparent)' }}
    >
      <div className="container">
        <div className="section-head">
          <span className="badge">
            <Route style={{ width: 14, height: 14 }} />
            THE EXPERIENCE
          </span>
          <h2>
            How <span className="grad-text">MTONYO+</span> Works
          </h2>
          <p>Four steps, from your upload to money in your dashboard.</p>
        </div>

        <div className="steps">
          {/* Numbering comes from a CSS counter on `.step`, so the order stays
              right without the markup repeating it. */}
          {STEPS.map((s) => (
            <div key={s.title} className={`step ${s.tone || ''}`.trim()}>
              <span className="s-ic">
                <Icon name={s.icon} />
              </span>
              <h4>{s.title}</h4>
              <p>{s.text}</p>
            </div>
          ))}
        </div>

        {/**
         * The three ways to release something, spelled out in the client's own
         * words. This is the decision a creator has to understand before
         * anything else on the platform makes sense.
         */}
        <div className="section-head" style={{ marginTop: 72 }}>
          <h2>
            You Choose How Your <span className="grad-text">Audience Watches</span>
          </h2>
          <p>Three options, chosen per video — not once for your whole channel.</p>
        </div>

        <div className="access-options">
          {ACCESS_OPTIONS.map((o) => (
            <div key={o.key} className={`access-option ${o.tone || ''}`.trim()}>
              <span className="ao-ic">
                <Icon name={o.icon} />
              </span>
              <h4>{o.label}</h4>
              <b className="ao-tagline">{o.tagline}</b>
              <p>{o.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
