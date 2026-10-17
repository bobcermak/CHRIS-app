import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { dur, ease } from '../../motion/presets'
import { approvedVerb, BRAND_VERB, STAGE_LABEL, toStage, VERBS } from '../../lib/thinking/verbs'

const INTERVAL_MS = 1800
const REDUCED_INTERVAL_MS = 3000

function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

interface ThinkingLineProps {
  stage: string | undefined
  /** Verb suggested by the backend; used only when approved for the stage. */
  verb?: string
  /** Real progress, shown next to the verb (never replaced by it). */
  pct?: number
  className?: string
}

/**
 * Scientific verbs while the backend works (§10.1). Opens with the house verb "Chrisuji…", then a
 * new verb ~every 1.8 s, shuffled without repeats until the stage pool is used up. Screen readers
 * hear only stage changes.
 */
export function ThinkingLine({ stage: rawStage, verb, pct, className }: ThinkingLineProps) {
  const stage = toStage(rawStage)
  const reduce = useReducedMotion()
  const pool = useRef<string[]>([])
  // Every run opens with the house verb; it holds for one tick even if the stage arrives meanwhile.
  const [current, setCurrent] = useState(() => approvedVerb(stage, verb) ?? BRAND_VERB)
  const shown = useRef(current)
  const opening = useRef(true)

  const show = (v: string) => {
    shown.current = v
    setCurrent(v)
  }

  const next = useMemo(
    () => () => {
      if (pool.current.length === 0) pool.current = shuffle(VERBS[stage])
      // Never the same verb twice in a row (a reshuffle can start with the one on screen).
      if (pool.current[0] === shown.current && pool.current.length > 1) pool.current.push(pool.current.shift()!)
      return pool.current.shift() ?? VERBS[stage][0]
    },
    [stage],
  )

  // Stage switch: change the pool immediately so the first verb signals progress.
  useEffect(() => {
    pool.current = shuffle(VERBS[stage])
    const approved = approvedVerb(stage, verb)
    if (approved) show(approved)
    else if (!opening.current) show(next())
    // verb changes are handled below; only react to the stage here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage])

  useEffect(() => {
    const approved = approvedVerb(stage, verb)
    if (approved) show(approved)
  }, [stage, verb])

  useEffect(() => {
    const id = window.setInterval(() => {
      opening.current = false
      show(next())
    }, reduce ? REDUCED_INTERVAL_MS : INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [next, reduce])

  return (
    <div className={`flex items-center gap-3 ${className ?? ''}`}>
      <span aria-hidden className="relative flex size-2.5 items-center justify-center">
        <span className="absolute inline-flex size-full rounded-full bg-orange-500/30 motion-safe:animate-ping" />
        <span className="relative inline-flex size-1.5 rounded-full bg-orange-500" />
      </span>
      <span className="relative inline-grid overflow-hidden text-small text-text-muted" aria-hidden>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={current}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, filter: 'blur(2px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10, filter: 'blur(2px)' }}
            transition={{ duration: dur.base, ease }}
            className="col-start-1 row-start-1 whitespace-nowrap"
          >
            {current}
          </motion.span>
        </AnimatePresence>
      </span>
      {pct !== undefined && (
        <span className="font-mono text-meta tabular text-text-faint" aria-hidden>
          {Math.round(pct)} %
        </span>
      )}
      <span className="sr-only" aria-live="polite">
        {STAGE_LABEL[stage]}
      </span>
    </div>
  )
}
