import useInView from '@/hooks/useInView'
import usePrefersReducedMotion from '@/hooks/usePrefersReducedMotion'

/**
 * Scroll-reveal wrapper — the React version of `.reveal / .reveal-l / .reveal-r`
 * plus the `.d1 … .d4` stagger delays.
 *
 * Content is visible by default. Pending animation is opt-in via `.is-pending`,
 * so a late IntersectionObserver can never leave a section permanently blank.
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
  const skip = immediate || reduced
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
