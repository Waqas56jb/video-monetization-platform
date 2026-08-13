import { Lock, Megaphone, PlayCircle, Sparkles } from 'lucide-react'
import Icon from '@/components/ui/Icon'
import Reveal from '@/components/ui/Reveal'
import { ACCESS_OPTIONS } from '@/data/copy'

/**
 * The three ways to release something — the decision a creator has to
 * understand before anything else on the platform makes sense.
 *
 * This used to be a third row of identical cards, directly under two other rows
 * of identical cards. The client's words were exact: "heading → rectangular
 * boxes → empty space → heading → more boxes… it feels like a PDF." They were
 * right, and this is the section where it mattered most, because these three
 * options are the product.
 *
 * So each one gets a full-width band with the explanation on one side and a
 * picture of what actually happens on the other, alternating sides down the
 * page. The rhythm breaks, and — more usefully — "Paid Premiere" stops being a
 * paragraph and becomes a timeline you can see turning free.
 *
 * The diagrams are built from boxes and text, not photographs. Every viewer
 * here is on mobile data; a section that explains the business model should not
 * cost three images to read.
 */

/** A labelled run of time. The whole idea of these models is what happens when. */
function Track({ segments }) {
  return (
    <div className="mv-track">
      {segments.map((s) => (
        <div key={s.label} className={`mv-seg ${s.tone}`} style={{ flexGrow: s.grow }}>
          <span className="mv-seg-label">{s.label}</span>
          {s.note && <small>{s.note}</small>}
        </div>
      ))}
    </div>
  )
}

const DIAGRAMS = {
  /* One payment, and it does not run out. */
  ppv_forever: (
    <>
      <div className="mv-head">
        <Lock size={14} />
        Locked until paid
      </div>
      <Track
        segments={[
          { label: 'Free preview', note: 'You set the length', tone: 'is-free', grow: 1 },
          { label: 'Paid', note: 'The rest of the video', tone: 'is-paid', grow: 3 },
        ]}
      />
      <div className="mv-foot is-good">
        <Sparkles size={14} />
        Bought once — stays in their library
      </div>
    </>
  ),

  /* The one that needs seeing rather than reading: it changes state on a date. */
  paid_premiere: (
    <>
      <div className="mv-head">
        <Lock size={14} />
        Paid for a period you choose
      </div>
      <Track
        segments={[
          { label: 'Paid', note: 'e.g. 30 days', tone: 'is-paid', grow: 2 },
          { label: 'Free + Ads', note: 'Automatically, from then on', tone: 'is-ads', grow: 3 },
        ]}
      />
      <div className="mv-foot is-good">
        <Sparkles size={14} />
        Everyone who paid keeps it ad-free
      </div>
    </>
  ),

  /* Free to the viewer, and still earning. */
  free_with_ads: (
    <>
      <div className="mv-head">
        <Megaphone size={14} />
        Free to watch, from day one
      </div>
      <Track
        segments={[
          { label: 'Ad', note: 'Skippable', tone: 'is-ads', grow: 1 },
          { label: 'The whole video', note: 'No paywall', tone: 'is-free', grow: 5 },
        ]}
      />
      <div className="mv-foot is-good">
        <PlayCircle size={14} />
        You earn a share of every advert shown
      </div>
    </>
  ),
}

export default function AccessModels() {
  return (
    <section className="section section-models" id="models">
      <div className="container">
        <div className="section-head">
          <span className="badge">
            <Sparkles style={{ width: 14, height: 14 }} />
            YOUR CONTENT. YOUR RULES.
          </span>
          <h2>
            You Choose How Your <span className="grad-text">Audience Watches</span>
          </h2>
          <p>Three options, chosen per video — not once for your whole channel.</p>
        </div>

        <div className="models">
          {ACCESS_OPTIONS.map((o, i) => (
            <Reveal
              key={o.key}
              /* Alternating sides is the whole point — it is what stops three
                 explanations in a row reading as one long list. */
              className={`model ${o.tone || ''} ${i % 2 ? 'is-flipped' : ''}`.trim()}
              variant={i % 2 ? 'right' : 'left'}
            >
              <div className="model-copy">
                <span className="model-ic">
                  <Icon name={o.icon} />
                </span>
                <h3>{o.label}</h3>
                <b className="model-tagline">{o.tagline}</b>
                <p>{o.text}</p>
              </div>
              <div className="model-viz">{DIAGRAMS[o.key]}</div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
