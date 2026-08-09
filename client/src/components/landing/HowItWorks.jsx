import { Route } from 'lucide-react'
import Reveal from '@/components/ui/Reveal'
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
        <Reveal className="section-head">
          <span className="badge">
            <Route style={{ width: 14, height: 14 }} />
            THE EXPERIENCE
          </span>
          <h2>
            From Discovery to <span className="grad-text">Full Video</span> in 60 Seconds
          </h2>
          <p>
            A friction-free journey built for how Tanzania actually pays — mobile money, instant
            unlock, no cards needed.
          </p>
        </Reveal>

        <div className="steps">
          {STEPS.map((s) => (
            <Reveal
              key={s.title}
              className={`step ${s.tone || ''}`.trim()}
              delay={s.delay || 0}
            >
              <span className="s-ic">
                <Icon name={s.icon} />
              </span>
              <h4>{s.title}</h4>
              <p>{s.text}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
