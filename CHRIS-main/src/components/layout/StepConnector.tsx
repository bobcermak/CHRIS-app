import { motion, useReducedMotion } from 'motion/react'
import { ease } from '../../motion/presets'

/** Minimal hairline between two steps; it quietly warms to orange once the step is done. */
export function StepConnector({ done, index }: { done: boolean; index: number }) {
  const reduce = useReducedMotion()
  return (
    <li aria-hidden className="mx-1 flex h-8 w-5 items-center lg:w-7">
      <span className="relative block h-px w-full bg-line-strong">
        <motion.span
          className="absolute inset-0 origin-left bg-orange-500/70"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: done ? 1 : 0 }}
          transition={{ duration: reduce ? 0 : 0.4, ease, delay: done && !reduce ? 0.1 + index * 0.1 : 0 }}
        />
      </span>
    </li>
  )
}
