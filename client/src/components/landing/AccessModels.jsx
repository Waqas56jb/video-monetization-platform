import { Check, Sparkles } from 'lucide-react'
import Icon from '@/components/ui/Icon'
import Reveal from '@/components/ui/Reveal'
import { ACCESS_OPTIONS } from '@/data/copy'

/**
 * The three ways to release a video — the decision a creator has to
 * understand before anything else on the platform makes sense.
 *
 * REDESIGNED 2026-11-17. The client: "redesign it so Pay Once, Paid Premiere
 * and Free + Ads are extremely simple, clear and attractive. Right now it is
 * too confusing." The old version gave each model a full-width band with a
 * creator-side name ("Sell it", "Premiere it") plus "Shows to viewers as …",
 * so every option had two names and a paragraph to read.
 *
 * Now: three cards side by side, one name each (the one viewers see on every
 * video card), a one-line promise, one picture of what happens over time, and
 * three short facts. A visitor can compare them at a glance — which is the
 * whole job of this section.
 */

/** What happens over the life of the video, as one labelled bar. */
function Timeline({ segments }) {
  return (
    <div className="em-track" aria-hidden="true">
      {segments.map((s) => (
        <span key={s.label} className={`em-seg ${s.tone}`} style={{ flexGrow: s.grow }}>
          {s.label}
        </span>
      ))}
    </div>
  )
}

export default function AccessModels() {
  return (
    <section className="section section-models" id="models">
      <div className="container">
        <div className="section-head">
          <span className="badge">
            <Sparkles style={{ width: 14, height: 14 }} />
            THREE WAYS TO EARN
          </span>
          <h2>
            You Choose How You <span className="grad-text">Earn</span>
          </h2>
          <p>Pick one for each video — not once for your whole channel.</p>
        </div>

        <div className="earn-models">
          {ACCESS_OPTIONS.map((o, i) => (
            <Reveal
              key={o.key}
              className={`earn-model ${o.tone || ''}`.trim()}
              variant="up"
              delay={i}
            >
              <div className="em-top">
                <span className="em-ic">
                  <Icon name={o.icon} />
                </span>
                <span className="em-step">{i + 1}</span>
              </div>
              <h3>{o.viewerTag}</h3>
              <p className="em-promise">{o.promise}</p>

              <Timeline segments={o.timeline} />

              <ul className="em-points">
                {o.points.map((pt) => (
                  <li key={pt}>
                    <Check size={15} />
                    {pt}
                  </li>
                ))}
              </ul>

              <p className="em-best">
                <span>Best for</span>
                {o.bestFor}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
