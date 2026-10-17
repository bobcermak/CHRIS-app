import { useNavigate, useParams } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnalysisTrace } from '../components/clarify/AnalysisTrace'
import { AnsweredRound } from '../components/clarify/AnsweredRound'
import { ClarifyForm } from '../components/clarify/ClarifyForm'
import { ErrorNote } from '../components/system/ErrorNote'
import { NotFound } from '../components/system/Fallbacks'
import { ThinkingLine } from '../components/thinking/ThinkingLine'
import { Button } from '../components/ui/Button'
import { data } from '../lib/data'
import type { ClarifyAnswer, ClarifyRound, MatchResult } from '../lib/data'
import { useCacheWriters, useMatch, useProject } from '../lib/queries'
import { useStream } from '../lib/stream/useStream'
import { useProjectStore, type ClarifyProgress } from '../stores/projectStore'
import { fadeUp } from '../motion/presets'

interface DoneRound {
  round: ClarifyRound
  answers: ClarifyAnswer[]
}

const HEADINGS: Record<number, string> = {
  1: 'Než sestavím tým, upřesněme pár věcí',
}

export function ClarifyPage() {
  const { id } = useParams({ from: '/projekt/$id/upresneni' })
  const navigate = useNavigate()
  const project = useProject(id)
  const existingMatch = useMatch(id)
  const { setMatch } = useCacheWriters()

  // Restore saved progress, so leaving to the home page and coming back shows the same state.
  const saved = useProjectStore((s) => s.clarify[id])
  const setClarify = useProjectStore((s) => s.setClarify)
  const [initial] = useState<ClarifyProgress | undefined>(saved)
  const [done, setDone] = useState<DoneRound[]>(initial?.done ?? [])
  const [current, setCurrent] = useState<ClarifyRound | null>(initial?.current ?? null)

  const matchStream = useStream<MatchResult>((result) => {
    setMatch(id, result)
    void navigate({ to: '/projekt/$id/tymy', params: { id } })
  })

  const startMatch = useCallback(() => {
    setCurrent(null)
    void matchStream.start(data.match(id))
  }, [id, matchStream])

  const clarify = useStream<ClarifyRound>((round) => {
    if (round.ready) startMatch()
    else setCurrent(round)
  })

  // Folded analysis summary: the live run once it finished, otherwise the one restored from storage.
  const finished = clarify.status === 'done' && clarify.startedAt !== undefined && clarify.finishedAt !== undefined
  const liveStages = clarify.steps.map((s) => s.stage).join(',')
  const liveMs = finished ? clarify.finishedAt! - clarify.startedAt! : 0
  const trace = useMemo<ClarifyProgress['trace']>(
    () => (finished ? { stages: liveStages.split(','), ms: liveMs } : (initial?.trace ?? null)),
    [finished, liveStages, liveMs, initial],
  )

  useEffect(() => {
    setClarify(id, { done, current, trace })
  }, [id, done, current, trace, setClarify])

  // First round on entry (unless the project already has teams — then offer to go there).
  const started = useRef(false)
  useEffect(() => {
    if (started.current || !project.data || existingMatch.isPending || existingMatch.data) return
    started.current = true
    if (initial?.current) return // the open round is restored as it was
    if (initial?.done.length) void matchStream.start(data.match(id)) // left while teams were being composed — finish it
    else void clarify.start(data.clarify(id))
  }, [project.data, existingMatch.isPending, existingMatch.data, clarify, matchStream, id, initial])


  const answer = (answers: ClarifyAnswer[], finish: boolean) => {
    if (current) setDone((d) => [...d, { round: current, answers }])
    setCurrent(null)
    void clarify.start(data.answer(id, answers, finish))
  }

  if (project.isError) return <NotFound />

  const showForm = current && clarify.status !== 'running'

  return (
    <div className="dot-grid relative flex-1">
      <div className="mx-auto w-full max-w-[864px] px-5 pt-12 pb-24 sm:pt-16">
        {project.data && (
          <motion.div variants={fadeUp} initial="hidden" animate="show" className="mb-10 flex justify-end">
            <p className="max-w-[82%] rounded-[20px] rounded-br-md border border-line bg-card px-5 py-3.5 text-body text-text shadow-[0_1px_2px_rgb(29_29_31/0.04)]">
              {project.data.prompt}
            </p>
          </motion.div>
        )}

        {existingMatch.data && !current && clarify.status === 'idle' && matchStream.status === 'idle' ? (
          <div className="flex flex-col gap-8">
            {/* The whole conversation stays readable when coming back to a finished project. */}
            <AnalysisTrace stream={clarify} saved={trace} />
            {done.length > 0 ? (
              done.map((d) => <AnsweredRound key={d.round.round} round={d.round} answers={d.answers} />)
            ) : (
              // Only with saved progress — without it we don't know whether questions were asked.
              initial && <p className="text-small text-text-muted">Zadání stačilo, nebylo potřeba se doptávat.</p>
            )}
            <div className="flex flex-col items-start gap-4">
              <h1 className="font-display text-display font-medium">Upřesnění je hotové</h1>
              <p className="text-body text-text-muted">Týmy pro tento projekt už máme sestavené.</p>
              <div className="flex gap-3">
                <Button href={`/projekt/${id}/tymy`} variant="primary" ariaLabel="Zobrazit týmy">
                  Zobrazit týmy
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  ariaLabel="Upřesnit znovu"
                  onClick={() => {
                    started.current = true
                    setDone([])
                    setCurrent(null)
                    void clarify.start(data.clarify(id))
                  }}
                >
                  Upřesnit znovu
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            <AnalysisTrace stream={clarify} saved={trace} />

            {done.map((d) => (
              <AnsweredRound key={d.round.round} round={d.round} answers={d.answers} />
            ))}

            <AnimatePresence mode="wait">
              {showForm && (
                <motion.section key={current.round} variants={fadeUp} initial="hidden" animate="show" exit="exit" aria-labelledby="clarify-heading">
                  <h1 id="clarify-heading" className="font-display text-display font-medium outline-none">
                    {HEADINGS[current.round] ?? 'Ještě pár upřesnění'}
                  </h1>
                  {current.reason && <p className="mt-2 mb-7 text-body text-text-muted">{current.reason}</p>}
                  <ClarifyForm
                    round={current}
                    busy={clarify.status === 'running'}
                    onSubmit={(answers) => answer(answers, false)}
                    onSkip={() =>
                      answer(
                        current.questions.map((q) => ({ question_id: q.id, value: null, unknown: true })),
                        true,
                      )
                    }
                  />
                </motion.section>
              )}
            </AnimatePresence>

            {clarify.status === 'error' && (
              <ErrorNote message={clarify.error} onRetry={() => void clarify.start(data.clarify(id))} />
            )}

            {(matchStream.status === 'running' || matchStream.status === 'done') && (
              <motion.div variants={fadeUp} initial="hidden" animate="show" className="flex flex-col gap-3">
                <h1 className="font-display text-display font-medium">Sestavuji týmy</h1>
                <p className="text-body text-text-muted">Hledám skupiny v katalogu, počítám shodu a ověřuji zdroje.</p>
                <ThinkingLine stage={matchStream.stage} verb={matchStream.verb} pct={matchStream.pct} className="mt-2" />
              </motion.div>
            )}
            {matchStream.status === 'error' && <ErrorNote message={matchStream.error} onRetry={startMatch} />}
          </div>
        )}
      </div>
    </div>
  )
}

