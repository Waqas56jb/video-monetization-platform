import { Gem } from 'lucide-react'
import Reveal from '@/components/ui/Reveal'
import Icon from '@/components/ui/Icon'
import { FEATURES } from '@/data/content'

export default function Features() {
  return (
    <section className="section" id="features">
      <div className="container">
        <Reveal className="section-head">
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
        </Reveal>

        <div className="feat-grid">
          {FEATURES.map((f) => (
            <Reveal key={f.title} className={`feat ${f.tone || ''}`.trim()} delay={f.delay || 0}>
              <span className="f-ic">
                <Icon name={f.icon} />
              </span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
