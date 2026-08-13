import { Route } from 'lucide-react'
import Icon from '@/components/ui/Icon'
import { STEPS } from '@/data/copy'

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

        {/* The three release models used to sit here as a third row of cards
            directly under this one. They have their own section now — see
            AccessModels — because they are the product, not a footnote. */}
      </div>
    </section>
  )
}
