import { CaretRightIcon } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { useId, useState } from 'react'
import { STAGE_LABEL, toStage } from '../../lib/thinking/verbs'
import type { StreamState } from '../../lib/stream/useStream'
import { formatDuration, plural } from '../../lib/utils/format'
import { collapse, dur, ease } from '../../motion/presets'
import { ThinkingLine } from '../thinking/ThinkingLine'

/**
 * Live scientific verbs while the backend works; afterwards folds into
 * "Analyzováno za 3,2 s · 3 kroky ▸" with an expandable list of steps (§10.1 — never "Přemýšlel").
 */
interface AnalysisTraceProps {
  stream: Pick<StreamState<unknown>, 'status' | 'stage' | 'verb' | 'pct' | 'steps' | 'startedAt' | 'finishedAt'>
  /** Summary restored from a previous visit, shown while no new analysis runs. */
  saved?: { stages: string[]; ms: number } | null
}

export function AnalysisTrace({ stream, saved }: AnalysisTraceProps) {
  const [open, setOpen] = useState(false)
  const listId = useId()

  if (stream.status === 'idle' && !saved) return null

  if (stream.status === 'running') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: dur.base, ease }}>
        <ThinkingLine stage={stream.stage} verb={stream.verb} pct={stream.pct} />
      </motion.div>
    )
  }

  const live = stream.status !== 'idle'
  const stages = live ? stream.steps.map((s) => s.stage) : (saved?.stages ?? [])
  const ms = live ? (stream.finishedAt ?? 0) - (stream.startedAt ?? 0) : (saved?.ms ?? 0)
  const n = stages.length

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={listId}
        className="group inline-flex items-center gap-2 rounded-full py-1 text-small text-text-muted transition-colors hover:text-text"
      >
        <span aria-hidden className="size-1.5 rotate-45 bg-charcoal-300 transition-[background-color,rotate] group-hover:rotate-[135deg] group-hover:bg-orange-500" />
        Analyzováno za {formatDuration(ms)} · {n} {plural(n, ['krok', 'kroky', 'kroků'])}
        <CaretRightIcon size={16} className={`transition-transform duration-(--dur-hover) ease-(--ease-out) group-hover:translate-x-0.5 ${open ? 'rotate-90' : ''}`} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ol id={listId} variants={collapse} initial="closed" animate="open" exit="closed" className="overflow-hidden">
            {stages.map((stage, i) => (
              <li key={stage + i} className="flex items-center gap-3 py-1 pl-3.5 text-small text-text-muted">
                <span className="font-mono text-meta text-text-muted tabular">{String(i + 1).padStart(2, '0')}</span>
                {STAGE_LABEL[toStage(stage)]}
              </li>
            ))}
          </motion.ol>
        )}
      </AnimatePresence>
    </div>
  )
}
