import { motion, useReducedMotion } from 'motion/react'
import { dur, ease } from '../../motion/presets'
import { Percent } from './Percent'

interface GaugeProps {
  /** 0..1 */
  value: number
  caption?: string
}

const R = 92
const ARC = `M ${110 - R} 110 A ${R} ${R} 0 0 1 ${110 + R} 110`

/** Half-circle gauge in orange; the arc draws itself (pathLength) and the number counts up. */
export function Gauge({ value, caption = 'shoda' }: GaugeProps) {
  const reduce = useReducedMotion()
  return (
    <figure className="relative mx-auto w-full max-w-[260px]">
      <svg viewBox="0 0 220 124" className="w-full overflow-visible" aria-hidden>
        <path d={ARC} fill="none" stroke="var(--inset)" strokeWidth="18" strokeLinecap="round" />
        <motion.path
          d={ARC}
          fill="none"
          stroke="var(--orange-500)"
          strokeWidth="18"
          strokeLinecap="round"
          initial={{ pathLength: reduce ? value : 0 }}
          whileInView={{ pathLength: value }}
          viewport={{ once: true }}
          transition={{ duration: dur.slow, ease }}
        />
      </svg>
      <figcaption className="absolute inset-x-0 bottom-0 flex flex-col items-center">
        <Percent value={value} size="xl" tone="ink" label={caption} />
        <span className="mt-1 text-small text-text-muted" aria-hidden>
          {caption}
        </span>
      </figcaption>
    </figure>
  )
}
