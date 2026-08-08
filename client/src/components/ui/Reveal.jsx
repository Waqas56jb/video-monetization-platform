import useInView from '@/hooks/useInView'
import usePrefersReducedMotion from '@/hooks/usePrefersReducedMotion'

/**
 * Scroll-reveal wrapper — the React version of `.reveal / .reveal-l / .reveal-r`
 * plus the `.d1 … .d4` stagger delays.
 *
 * variant : 'up' | 'left' | 'right'
 * delay   : 0 | 1 | 2 | 3 | 4  (→ .d1 … .d4)
 * immediate: render already revealed (used for above-the-fold hero content)
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
    inView ? 'in' : '',
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
