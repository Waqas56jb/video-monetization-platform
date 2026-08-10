import { Gem } from 'lucide-react'
import Icon from '@/components/ui/Icon'
import { CONTENT_KINDS, FEATURES } from '@/data/copy'

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
            Share Any Story. <span className="grad-text">Earn Your Way.</span>
          </h2>
          <p>
            Whatever you make, MTONYO+ can sell it — built on world-class streaming infrastructure
            and secure payments.
          </p>

          {/**
           * What people actually publish here.
           *
           * The page read as a film-and-music platform, which quietly tells a
           * podcaster or a tutor that it is not for them. Naming the range is the
           * cheapest way to say otherwise.
           */}
          <ul className="kind-chips">
            {CONTENT_KINDS.map((kind) => (
              <li key={kind}>{kind}</li>
            ))}
          </ul>
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
