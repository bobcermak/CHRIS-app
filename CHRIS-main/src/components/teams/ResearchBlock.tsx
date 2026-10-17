import { BinocularsIcon } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import type { ResearchReport } from '../../lib/data'
import { useDeepResearch } from '../../lib/queries'
import { fadeUp } from '../../motion/presets'
import { ErrorNote } from '../system/ErrorNote'
import { ThinkingLine } from '../thinking/ThinkingLine'
import { Button } from '../ui/Button'
import { PanelCard } from '../ui/SidePanel'
import { Claims, SourceList } from './Claims'

function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return rem ? `${m} min ${rem} s` : `${m} min`
}

/** Tracks a run's wall-clock time across fetchStatus transitions; ticks each second while fetching. */
function useElapsed(fetching: boolean): string | null {
  const [elapsedMs, setElapsedMs] = useState<number | null>(null)
  useEffect(() => {
    if (!fetching) return
    const t0 = performance.now()
    const tick = () => setElapsedMs(performance.now() - t0)
    tick()
    const id = window.setInterval(tick, 1000)
    return () => {
      window.clearInterval(id)
      tick()
    }
  }, [fetching])
  return elapsedMs === null ? null : formatElapsed(elapsedMs)
}

interface ResearchBlockProps {
  projectId: string
  target: ResearchReport['target']
  title?: string
  subtitle: string
}

/** Deep research: idle → scientific verbs while running → sections with sources. Cached per session. */
export function ResearchBlock({ projectId, target, title = 'Deep research', subtitle }: ResearchBlockProps) {
  const q = useDeepResearch(projectId, target)
  const fetching = q.fetchStatus === 'fetching'
  const elapsed = useElapsed(fetching)
  const result = q.data
  const errored = q.error && !fetching
  const idle = !fetching && !result && !errored
  // Fresh numbering each render: claims register their sources, the list below reads them.
  const numbering = new Map<string, number>()

  return (
    <PanelCard>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-heading font-medium">{title}</h3>
          <p className="mt-0.5 text-small text-text-muted">{subtitle}</p>
        </div>
        {idle && (
          <Button type="button" variant="outline" size="sm" ariaLabel="Spustit deep research" onClick={q.start}>
            <BinocularsIcon size={16} aria-hidden />
            Spustit
          </Button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {fetching && (
          <motion.div key="run" variants={fadeUp} initial="hidden" animate="show" exit="exit" className="mt-4 flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <ThinkingLine stage="research" />
              {elapsed && <span className="font-mono text-meta tabular text-text-faint" aria-live="off">{elapsed}</span>}
            </div>
            <span className="text-meta text-text-faint">může trvat několik minut</span>
          </motion.div>
        )}
        {result && !fetching && (
          <motion.div key="done" variants={fadeUp} initial="hidden" animate="show" className="mt-5 flex flex-col gap-5">
            {result.sections.map((s, i) => (
              <motion.section key={s.key} variants={fadeUp} initial="hidden" animate="show" custom={i}>
                {result.sections.length > 1 && (
                  <h4 className="mb-1.5 font-mono text-meta tracking-[0.1em] text-text-muted uppercase">{s.title}</h4>
                )}
                <Claims claims={s.claims} citations={result.citations} numbering={numbering} />
              </motion.section>
            ))}
            <div className="border-t border-line pt-4">
              <h4 className="mb-2 font-mono text-meta tracking-[0.1em] text-text-muted uppercase">Zdroje</h4>
              <SourceList citations={result.citations} numbering={numbering} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {errored && (
        <div className="mt-4">
          <ErrorNote message={q.error instanceof Error ? q.error.message : 'Deep research se nepovedl.'} onRetry={() => void q.refetch()} />
        </div>
      )}
    </PanelCard>
  )
}
