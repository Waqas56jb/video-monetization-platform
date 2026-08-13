import useInView from '@/hooks/useInView'
import usePrefersReducedMotion from '@/hooks/usePrefersReducedMotion'
import useMediaQuery, { LOW_POWER } from '@/hooks/useMediaQuery'

/**
 * Scroll-reveal wrapper — the React version of `.reveal / .reveal-l / .reveal-r`
 * plus the `.d1 … .d4` stagger delays.
 *
 * Content is visible by default. Pending animation is opt-in via `.is-pending`,
 * so a late IntersectionObserver can never leave a section permanently blank.
 *
 * On a phone or tablet it does not animate at all — and, importantly, it does
 * not merely get overridden in CSS. Hiding the effect in a stylesheet still
 * leaves an IntersectionObserver per section, a class change per section, and a
 * compositor layer for every element that was going to move. There are dozens
 * of these on the landing page, and the cost lands exactly where it hurts: on
 * the first scroll past the hero, on the device least able to absorb it.
 *
 * So the observer is never created. Skipping the work is the only version of
 * "turn the animation off" that actually costs nothing.
 */
const VARIANTS = { up: 'reveal', left: 'reveal-l', right: 'reveal-r' }

export default function Reveal({
  as: Tag = 'div',
  variant = 'up',
  delay = 0,
  immediate = false,
  className = '',
  children,
  ...rest
}) {
  const reduced = usePrefersReducedMotion()
  const lowPower = useMediaQuery(LOW_POWER)
  const skip = immediate || reduced || lowPower
  const [ref, inView] = useInView({ skip })

  const classes = [
    VARIANTS[variant] || VARIANTS.up,
    delay ? `d${delay}` : '',
    // Only hide when we are actively waiting to animate in.
    !skip && !inView ? 'is-pending' : '',
    inView || skip ? 'in' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <Tag ref={ref} className={classes} {...rest}>
      {children}
    </Tag>
  )
}
