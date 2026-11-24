import { useState } from 'react'
import { Monitor, Smartphone } from 'lucide-react'

/**
 * The banner exactly as the homepage draws it (client/src/components/landing/
 * SponsorStrip.jsx + its CSS, copied under `.sppv`), on a desktop-wide or a
 * phone-wide page, from what is in the form right now — so the admin sees it
 * before saving, and again before publishing (client, 2026-11-17, point 6:
 * "publish se pehle banner ka exact homepage preview").
 */
export function SponsorCard({ sponsor, title, tagline, cta, imageSrc }) {
  return (
    <div className={`sponsor-card${imageSrc ? ' has-image' : ''}`}>
      {imageSrc && <img src={imageSrc} alt="" width="1200" height="400" />}
      <span className="sponsor-copy">
        <small className="sponsor-label">Sponsored · {sponsor || 'Sponsor name'}</small>
        <strong>{title || 'Your headline'}</strong>
        {tagline && <span className="sponsor-tagline">{tagline}</span>}
      </span>
      <span className="btn btn-gold btn-sm sponsor-cta">{cta || 'Learn more'}</span>
    </div>
  )
}

export default function SponsorPreview({ banner, initialDevice = 'desktop' }) {
  const [device, setDevice] = useState(initialDevice)
  const mobile = device === 'mobile'
  return (
    <div className="sppv-wrap">
      <div className="seg" role="tablist" aria-label="Preview size">
        <button type="button" role="tab" aria-selected={!mobile} className={!mobile ? 'on' : ''} onClick={() => setDevice('desktop')}>
          <Monitor size={14} /> Desktop
        </button>
        <button type="button" role="tab" aria-selected={mobile} className={mobile ? 'on' : ''} onClick={() => setDevice('mobile')}>
          <Smartphone size={14} /> Mobile
        </button>
      </div>
      <div className={`sppv ${mobile ? 'is-mobile' : 'is-desktop'}`} aria-label={`Homepage preview, ${device}`}>
        <div className="sppv-nav">
          <span className="sppv-logo">
            MTONYO<span>+</span>
          </span>
          {!mobile && (
            <span className="sppv-links">
              <i />
              <i />
              <i />
            </span>
          )}
        </div>
        <div className="sppv-hero">
          <i style={{ width: mobile ? '78%' : '46%' }} />
          <i style={{ width: mobile ? '60%' : '34%' }} />
        </div>
        <section className="sponsor-strip">
          <SponsorCard {...banner} />
        </section>
        <div className="sppv-rows">
          {Array.from({ length: mobile ? 2 : 4 }, (_, i) => (
            <i key={i} />
          ))}
        </div>
      </div>
      <p className="field-note" style={{ margin: '8px 0 0' }}>
        This is how it appears under the homepage header. A click opens the sponsor’s address in a new tab and is counted.
      </p>
    </div>
  )
}
