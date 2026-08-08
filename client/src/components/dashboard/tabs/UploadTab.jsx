import { useState } from 'react'
import { Check, Info, Rocket, UploadCloud } from 'lucide-react'
import Panel from '../Panel'
import Field from '@/components/ui/Field'
import Icon from '@/components/ui/Icon'
import { IMG } from '@/data/content'
import { useToast } from '@/context/ToastContext'

const SELL_OPTIONS = [
  {
    value: 'ppv',
    icon: 'infinity',
    title: 'PPV Forever',
    text: 'Set a price and keep it paid forever. Fans buy once, own it always.',
  },
  {
    value: 'premiere',
    icon: 'calendar-clock',
    title: 'Paid Premiere',
    text: 'Paid for a set period, then auto-releases free with ads — and keeps earning.',
  },
]

const SHARE_TARGETS = [
  { icon: 'instagram', label: 'Instagram', toast: 'Sharing to Instagram…' },
  { icon: 'music-2', label: 'TikTok', toast: 'Sharing to TikTok…' },
  { icon: 'message-circle', label: 'WhatsApp', toast: 'Sharing to WhatsApp…' },
  { icon: 'link', label: 'Copy Link', toast: 'Link copied! creator.tz/v/the-journey' },
]

export default function UploadTab() {
  const showToast = useToast()
  const [sellType, setSellType] = useState('premiere')

  return (
    <div className="two-col">
      {/* ---- left column: file + details ---- */}
      <div>
        <Panel title="1 · Upload Your Video">
          <button
            type="button"
            className="upload-zone"
            onClick={() =>
              showToast(
                'In your full build this opens the file picker → direct to Cloudflare Stream'
              )
            }
          >
            <span className="uz-ic">
              <UploadCloud />
            </span>
            <h4>Drag &amp; drop your video here</h4>
            <p>
              or <b>browse files</b> — MP4, MOV up to 4K · Uploads go directly to secure streaming
              servers
            </p>
          </button>
        </Panel>

        <Panel title="2 · Video Details">
          <Field
            id="up-title"
            label="Video Title"
            icon="type"
            type="text"
            defaultValue="The Journey — Live Performance"
          />
          <Field
            id="up-desc"
            label="Description"
            icon="align-left"
            type="text"
            defaultValue="An exclusive live performance from Dar es Salaam."
          />
          <div className="form-grid">
            <Field id="up-cat" label="Category" icon="tag" type="text" defaultValue="Music" />
            <Field
              id="up-preview"
              label="Free Preview Duration"
              icon="timer"
              type="text"
              defaultValue="5 minutes"
            />
          </div>
        </Panel>
      </div>

      {/* ---- right column: pricing + social preview ---- */}
      <div>
        <Panel title="3 · Pricing & Access">
          <div className="sell-opts">
            {SELL_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`sell-opt ${sellType === o.value ? 'on' : ''}`.trim()}
                onClick={() => setSellType(o.value)}
                aria-pressed={sellType === o.value}
              >
                <span className="check">
                  <Check />
                </span>
                <b>
                  <Icon name={o.icon} />
                  {o.title}
                </b>
                <p>{o.text}</p>
              </button>
            ))}
          </div>

          <div className="form-grid" style={{ marginTop: 20 }}>
            <Field id="up-price" label="Price (TZS)" icon="banknote" type="text" defaultValue="1,000" />
            <Field id="up-window" label="Paid For" icon="hourglass" type="text" defaultValue="30 days" />
          </div>

          <div className="notice">
            <Info />
            <span>
              After 30 days this video automatically becomes <b>FREE WITH ADS</b> and continues
              earning ad revenue for you.
            </span>
          </div>

          <button
            className="btn btn-gold btn-block"
            onClick={() => showToast('🎬 Video published! 60s social preview is being generated…')}
          >
            <Rocket />
            Publish Video
          </button>
        </Panel>

        <Panel title="4 · Auto Social Preview">
          <div style={{ borderRadius: 16, overflow: 'hidden', position: 'relative', marginBottom: 18 }}>
            <img
              src={IMG.journey}
              style={{ height: 150, width: '100%', objectFit: 'cover' }}
              alt=""
              loading="lazy"
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(10,10,18,.45)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <span
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  background: 'rgba(245,197,24,.95)',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#1a1200',
                }}
              >
                <Icon name="play" />
              </span>
            </div>
            <span className="pill pend" style={{ position: 'absolute', top: 10, left: 10 }}>
              60s PREVIEW · AUTO-GENERATED
            </span>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {SHARE_TARGETS.map((t) => (
              <button
                key={t.label}
                className="btn btn-ghost btn-sm"
                onClick={() => showToast(t.toast)}
              >
                <Icon name={t.icon} />
                {t.label}
              </button>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}
