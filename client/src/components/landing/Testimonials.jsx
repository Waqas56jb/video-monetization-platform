import { Heart, Star } from 'lucide-react'
import Reveal from '@/components/ui/Reveal'
import { TESTIMONIALS } from '@/data/content'

export default function Testimonials() {
  return (
    <section className="section" id="stories">
      <div className="container">
        <Reveal className="section-head">
          <span className="badge">
            <Heart style={{ width: 14, height: 14 }} />
            SUCCESS STORIES
          </span>
          <h2>
            Creators Are <span className="grad-text">Getting Paid</span>
          </h2>
          <p>Real Tanzanian creators, real mobile money in their pockets.</p>
        </Reveal>

        <div className="testi-grid">
          {TESTIMONIALS.map((t) => (
            <Reveal className="testi" key={t.name} delay={t.delay || 0}>
              <span className="quote">&ldquo;</span>
              <div className="stars">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} />
                ))}
              </div>
              <p>{t.text}</p>
              <div className="testi-user">
                <img src={t.avatar} alt="" loading="lazy" />
                <div>
                  <b>{t.name}</b>
                  <small>{t.role}</small>
                </div>
                <div className="amt">
                  <b>{t.amount}</b>
                  <small>{t.amountNote}</small>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
