import { motion } from 'motion/react'
import type { ClarifyAnswer, ClarifyRound } from '../../lib/data'
import { collapse } from '../../motion/presets'

function label(round: ClarifyRound, a: ClarifyAnswer): string {
  if (a.unknown || a.value === null || a.value === '') return 'Nechávám na vás'
  const q = round.questions.find((x) => x.id === a.question_id)
  const values = Array.isArray(a.value) ? a.value : [a.value]
  return values.map((v) => q?.options?.find((o) => o.id === v)?.label ?? v).join(', ')
}

/** A finished round, folded to question → answer pairs (§10.2: answered questions collapse). */
export function AnsweredRound({ round, answers }: { round: ClarifyRound; answers: ClarifyAnswer[] }) {
  return (
    <motion.dl variants={collapse} initial="closed" animate="open" className="overflow-hidden border-l-2 border-line pl-5">
      {round.questions.map((q) => {
        const a = answers.find((x) => x.question_id === q.id)
        return (
          <div key={q.id} className="py-1.5">
            <dt className="text-small text-text-muted">{q.text}</dt>
            <dd className="text-body text-text">{a ? label(round, a) : 'Nechávám na vás'}</dd>
          </div>
        )
      })}
    </motion.dl>
  )
}
