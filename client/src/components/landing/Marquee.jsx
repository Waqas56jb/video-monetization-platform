import { MARQUEE_ITEMS } from '@/data/content'

/** Infinite scrolling feature ticker. The list is doubled so the loop is seamless. */
export default function Marquee() {
  const items = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS]

  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee-track">
        {items.map((label, i) => (
          <span key={`${label}-${i}`}>
            <i>★</i> {label}
          </span>
        ))}
      </div>
    </div>
  )
}
