import { Link, useParams, useRouterState } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { useMatch } from '../../lib/queries'
import { cn } from '../../lib/utils/cn'
import { spring } from '../../motion/presets'
import { useProjectStore } from '../../stores/projectStore'
import { StepConnector } from './StepConnector'

const STEPS = [
  { n: '01', label: 'Zadání', segment: null },
  { n: '02', label: 'Upřesnění', segment: 'upresneni' },
  { n: '03', label: 'Týmy', segment: 'tymy' },
  { n: '04', label: 'Přihláška', segment: 'prihlaska' },
] as const

/** 01 Zadání · 02 Upřesnění · 03 Týmy · 04 Přihláška — shared active indicator (layoutId). */
export function Stepper() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const params = useParams({ strict: false }) as { id?: string }
  const projectId = params.id
  const match = useMatch(projectId ?? '')
  const hasApplication = useProjectStore((s) => (projectId ? Boolean(s.applicationOf[projectId]) : false))

  const active = STEPS.findIndex((s) => s.segment && pathname.endsWith(`/${s.segment}`))
  const current = active === -1 ? 0 : active

  const reachable = (i: number) => {
    if (i === 0) return true
    if (!projectId) return false
    if (i === 1) return true
    if (i === 2) return Boolean(match.data)
    return hasApplication
  }

  return (
    <>
      <p className="font-mono text-meta text-text-muted md:hidden" aria-hidden>
        <span className="text-orange-ink">{STEPS[current].n}</span> / 04 · {STEPS[current].label}
      </p>
      <nav aria-label="Kroky" className="hidden md:block">
        <ol className="flex items-center">
          {STEPS.flatMap((step, i) => {
            const isActive = i === current
            const enabled = reachable(i) && !isActive
            const content = (
              <>
                {isActive && (
                  <motion.span layoutId="stepper-active" className="absolute inset-0 rounded-full bg-orange-50" transition={spring} />
                )}
                <span className="relative font-mono text-[0.75rem] transition-[translate,color] group-hover/step:-translate-y-0.5 group-hover/step:text-orange-500">{step.n}</span>
                <span className="relative">{step.label}</span>
              </>
            )
            const base = 'relative inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-small transition-colors'
            const item = (
              <li key={step.n}>
                {enabled ? (
                  step.segment === null ? (
                    <Link to="/" className={cn(base, 'group/step text-text hover:text-orange-ink')}>
                      {content}
                    </Link>
                  ) : (
                    <Link
                      to={`/projekt/$id/${step.segment}`}
                      params={{ id: projectId! }}
                      className={cn(base, 'group/step text-text hover:text-orange-ink')}
                    >
                      {content}
                    </Link>
                  )
                ) : (
                  <span
                    aria-current={isActive ? 'step' : undefined}
                    aria-disabled={!isActive || undefined}
                    className={cn(base, isActive ? 'text-orange-ink' : 'cursor-default text-text-muted opacity-70')}
                  >
                    {content}
                  </span>
                )}
              </li>
            )
            return i === 0 ? [item] : [<StepConnector key={`c-${i}`} index={i - 1} done={i <= current} />, item]
          })}
        </ol>
      </nav>
    </>
  )
}
