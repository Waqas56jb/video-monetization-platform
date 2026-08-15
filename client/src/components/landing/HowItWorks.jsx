import { Route } from 'lucide-react'
import Icon from '@/components/ui/Icon'
import { STEPS } from '@/data/copy'

/**
 * The journey from an upload to money in a dashboard.
 *
 * This was four identical cards in a row, directly above two more grids of
 * cards — the "PDF made of boxes" the client described. Four boxes side by side
 * also say nothing about order: they read as four features, when they are
 * actually one sequence where each step only makes sense after the last.
 *
 * So it is a spine now. The steps alternate down a line, each with its own
 * oversized number, and the line is what carries the eye from upload to
 * earnings. Nothing was cut — the same four steps, the same words, the same
 * icons — but the shape finally says "then this happens".
 */
export default function HowItWorks() {
  return (
    <section className="section section-journey" id="how">
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

        {/* An ordered list because it is genuinely ordered — a screen reader
            should hear "1 of 4" rather than four unrelated headings. */}
        <ol className="journey">
          {STEPS.map((step, i) => (
            <li className={`jstep ${step.tone || ''}`.trim()} key={step.title}>
              <div className="jstep-rail" aria-hidden="true">
                <span className="jstep-dot">
                  <Icon name={step.icon} />
                </span>
              </div>

              <div className="jstep-body">
                {/* Decorative: the number is already in the list semantics. */}
                <span className="jstep-num" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
