import { motion, useReducedMotion, type HTMLMotionProps } from 'motion/react'
import { ease } from '../../motion/presets'

type Kind = 'rise' | 'unfold' | 'line'

interface RevealProps extends HTMLMotionProps<'div'> {
  kind?: Kind
  /** Seconds; use small steps (0.04–0.08) to cascade neighbours. */
  delay?: number
  /** Corner radius the unfold clip ends on (px). */
  radius?: number
}

const VIEWPORT = { once: true, amount: 0.15, margin: '0px 0px -8% 0px' } as const

/**
 * Viewport entrance (max 400 ms, once):
 * - rise   — fades in and settles 16 px upwards, de-blurring like a slide coming into focus
 * - unfold — a card opens from a narrow band to its full shape (clip-path), like a sheet being uncovered
 * - line   — a hairline draws itself from the left
 * Reduced motion → plain fade.
 */
export function Reveal({ kind = 'rise', delay = 0, radius = 28, children, ...props }: RevealProps) {
  const reduce = useReducedMotion()
  const t = { duration: 0.4, ease, delay }

  if (reduce) {
    return (
      <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={VIEWPORT} transition={{ duration: 0.25, delay }} {...props}>
        {children}
      </motion.div>
    )
  }

  const variants = {
    rise: { initial: { opacity: 0, y: 16, filter: 'blur(3px)' }, shown: { opacity: 1, y: 0, filter: 'blur(0px)' } },
    unfold: {
      initial: { opacity: 0, y: 20, clipPath: `inset(12% 3% 12% 3% round ${radius}px)` },
      shown: { opacity: 1, y: 0, clipPath: `inset(0% 0% 0% 0% round ${radius}px)` },
    },
    line: { initial: { scaleX: 0, originX: 0 }, shown: { scaleX: 1, originX: 0 } },
  }[kind]

  return (
    <motion.div initial={variants.initial} whileInView={variants.shown} viewport={VIEWPORT} transition={t} {...props}>
      {children}
    </motion.div>
  )
}
