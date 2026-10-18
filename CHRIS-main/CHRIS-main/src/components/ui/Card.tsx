import { motion, useReducedMotion, type HTMLMotionProps } from 'motion/react'
import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/utils/cn'
import { ease } from '../../motion/presets'

interface CardProps extends HTMLMotionProps<'section'> {
  /** Cascade delay (s) when several cards enter the viewport together. */
  delay?: number
  /** "mount": unfold right away with the page instead of when scrolled into view. */
  reveal?: 'view' | 'mount'
}

/**
 * White bento card, radius 28 (prototype v5). Enters the viewport by unfolding: it opens from a
 * narrow band to its full shape while settling upwards (once, 400 ms; reduced motion → fade).
 */
export function Card({ className, delay = 0, reveal = 'view', ...props }: CardProps) {
  const reduce = useReducedMotion()
  const shown = reduce ? { opacity: 1 } : { opacity: 1, y: 0, clipPath: 'inset(0% 0% 0% 0% round 28px)' }
  return (
    <motion.section
      className={cn('rounded-card bg-card p-6 sm:p-7', className)}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 20, clipPath: 'inset(10% 3% 10% 3% round 28px)' }}
      {...(reveal === 'mount' ? { animate: shown } : { whileInView: shown, viewport: { once: true, amount: 0.12 } })}
      transition={{ duration: reduce ? 0.25 : 0.4, ease, delay }}
      {...props}
    />
  )
}

interface CardHeaderProps {
  title: ReactNode
  aside?: ReactNode
  id?: string
}

export function CardHeader({ title, aside, id }: CardHeaderProps) {
  return (
    <header className="mb-5 flex items-baseline justify-between gap-4">
      <h2 id={id} className="font-display text-title font-medium">
        {title}
      </h2>
      {aside && <div className="text-small text-text-muted">{aside}</div>}
    </header>
  )
}

/** Nested grey block inside a card, radius 20. */
export function Inset({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-inset bg-inset', className)} {...props} />
}
