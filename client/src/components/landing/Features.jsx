import { Gem } from 'lucide-react'
import Icon from '@/components/ui/Icon'
import { FEATURES } from '@/data/copy'

export default function Features() {
  return (
    <section className="section" id="features">
      <div className="container">
        <div className="section-head">
          <span className="badge">
            <Gem style={{ width: 14, height: 14 }} />
            PLATFORM POWER
          </span>
          <h2>
            Everything a Creator Needs to <span className="grad-text">Monetize</span>
          </h2>
          <p>
            One upload. Everywhere. Real value — built with world-class streaming infrastructure and
            bank-grade payment security.
          </p>
        </div>

        <div className="feat-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className={`feat ${f.tone || ''}`.trim()}>
              <span className="f-ic">
                <Icon name={f.icon} />
              </span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
