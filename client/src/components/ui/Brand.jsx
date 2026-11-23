import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

/**
 * The client's branded artwork (2026-11-23), served from /public/brand.
 *
 * Every banner keeps its whole picture: `object-fit: contain` over a blurred
 * copy of itself, never a crop that loses the people, the logo or Kilimanjaro.
 * Narrow places get a purpose-made crop (`-narrow`), cut so the logo and the
 * call to action are both inside it.
 */
const src = (name, w) => `/brand/${name}-${w}.webp`
const set = (name, a, b) => `${src(name, a)} ${a}w, ${src(name, b)} ${b}w`

export const BRAND = {
  discover: { wide: set('discover', 1086, 2172), narrow: set('discover-narrow', 540, 1080), fallback: src('discover', 1086) },
  explore: { wide: set('explore', 1086, 2172), narrow: set('explore-narrow', 635, 1270), fallback: src('explore', 1086) },
  profileBg: src('profile-bg', 2172),
  profileBgSmall: src('profile-bg', 1086),
  montage: set('montage', 400, 800),
}

/**
 * Full-width banner: the Explore page header. Phones get the narrow crop.
 * `onActivate` replaces the link (on /explore itself the CTA scrolls to the
 * results instead of reloading the page it is already on).
 */
export function ExploreBanner({ onActivate }) {
  const art = (
    <picture>
      <source media="(max-width: 700px)" srcSet={BRAND.explore.narrow} sizes="100vw" />
      <img
        src={BRAND.explore.fallback}
        srcSet={BRAND.explore.wide}
        sizes="(max-width: 1400px) 100vw, 1400px"
        alt="Explore MTONYO+ — discover Africa's stories, talent and culture: films and movies, documentaries, cooking, music, entertainment and more. Browse all videos."
        width="2172"
        height="724"
        fetchpriority="high"
        decoding="async"
      />
    </picture>
  )
  return onActivate ? (
    <button type="button" className="brand-banner explore-banner" onClick={onActivate}>
      {art}
    </button>
  ) : (
    <Link className="brand-banner explore-banner" to="/explore">
      {art}
    </Link>
  )
}

/**
 * The tile that ends a short grid. It spans the columns the cards left empty
 * (see `.explore-tile` in global.css) and picks its crop from its own width
 * with a container query, so a one-column gap and a three-column gap both
 * show the artwork whole.
 */
export function DiscoverTile() {
  return (
    <Link className="explore-tile" to="/explore" aria-label="Discover more on MTONYO+ — browse all videos">
      <img className="et-blur" src={src('discover', 1086)} alt="" aria-hidden="true" loading="lazy" decoding="async" />
      <img className="et-art et-wide" srcSet={BRAND.discover.wide} sizes="(max-width: 1400px) 75vw, 1050px" src={BRAND.discover.fallback} alt="" loading="lazy" decoding="async" />
      <img className="et-art et-narrow" srcSet={BRAND.discover.narrow} sizes="(max-width: 600px) 100vw, 360px" src={src('discover-narrow', 540)} alt="" loading="lazy" decoding="async" />
    </Link>
  )
}

/** The small permanent card near the bottom of the watch page. */
export function DiscoverCard() {
  return (
    <Link className="discover-card" to="/explore">
      <div className="dc-copy">
        <b>
          Discover More on <span className="brand-accent">MTONYO+</span>
        </b>
        <span className="dc-cats">Films • Documentaries • Music • Cooking • Entertainment</span>
        <span className="dc-cta">
          Explore All Videos <ArrowRight size={16} />
        </span>
      </div>
      <img className="dc-art" srcSet={BRAND.montage} sizes="(max-width: 600px) 100vw, 400px" src={src('montage', 400)} alt="" loading="lazy" decoding="async" />
    </Link>
  )
}
