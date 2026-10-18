import type { ReactNode } from 'react'
import { cn } from '../../lib/utils/cn'

/** Small neutral label (roles, expertise). */
export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full bg-inset px-2.5 py-0.5 text-[0.75rem] leading-5 text-charcoal-700', className)}>
      {children}
    </span>
  )
}

/** Mono uppercase meta label (KONTROLA ŠABLONY, VEDOUCÍ · SKUPINA, …). */
export function MonoLabel({ children, className, tone = 'muted' }: { children: ReactNode; className?: string; tone?: 'muted' | 'accent' | 'risk' }) {
  return (
    <span
      className={cn(
        'font-mono text-meta uppercase',
        tone === 'accent' && 'rounded-md bg-orange-50 px-1.5 py-0.5 text-orange-ink',
        tone === 'risk' && 'rounded-md bg-card px-1.5 py-0.5 text-risk ring-1 ring-risk/40',
        tone === 'muted' && 'text-text-muted',
        className,
      )}
    >
      {children}
    </span>
  )
}
