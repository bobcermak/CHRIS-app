import { motion } from 'motion/react'
import { useEffect, useState, type FormEvent } from 'react'
import type { ClarifyAnswer, ClarifyRound } from '../../lib/data'
import { fadeUp } from '../../motion/presets'
import { Button } from '../ui/Button'
import { QuestionField, type AnswerValue } from './QuestionField'

interface ClarifyFormProps {
  round: ClarifyRound
  busy: boolean
  onSubmit: (answers: ClarifyAnswer[]) => void
  /** "Hledej teď" — skip the remaining questions and search immediately. */
  onSkip: () => void
}

function initialAnswers(round: ClarifyRound): Record<string, AnswerValue> {
  return Object.fromEntries(
    round.questions.map((q) => [q.id, { value: q.suggested ?? (q.kind === 'multi_choice' ? [] : ''), unknown: false }]),
  )
}

/** The question card of 02 Upřesnění (prototype v5): numbered questions, skip + continue. */
export function ClarifyForm({ round, busy, onSubmit, onSkip }: ClarifyFormProps) {
  const [answers, setAnswers] = useState(() => initialAnswers(round))

  // ⌘/Ctrl+Enter = Hledej teď (§12 keyboard).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !busy) {
        e.preventDefault()
        onSkip()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onSkip])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSubmit(
      round.questions.map((q) => {
        const a = answers[q.id]
        const empty = a.value === null || (typeof a.value === 'string' && !a.value.trim()) || (Array.isArray(a.value) && !a.value.length)
        return { question_id: q.id, value: a.unknown || empty ? null : a.value, unknown: a.unknown || empty }
      }),
    )
  }

  return (
    <motion.form
      onSubmit={submit}
      variants={fadeUp}
      initial="hidden"
      animate="show"
      className="overflow-hidden rounded-[22px] border border-line bg-card shadow-[0_18px_50px_-30px_rgb(29_29_31/0.25)]"
    >
      <div className="divide-y divide-line">
        {round.questions.map((q, i) => (
          <motion.div key={q.id} variants={fadeUp} initial="hidden" animate="show" custom={i + 1}>
            <QuestionField
              index={i}
              question={q}
              answer={answers[q.id]}
              autoFocus={i === 0}
              onChange={(next) => setAnswers((s) => ({ ...s, [q.id]: next }))}
            />
          </motion.div>
        ))}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4 sm:px-7">
        <Button type="button" variant="ghost" ariaLabel="Přeskočit a hledat hned" title="Ctrl/⌘ + Enter" onClick={onSkip} disabled={busy}>
          Přeskočit a hledat hned
        </Button>
        <Button type="submit" variant="primary" ariaLabel="Pokračovat" disabled={busy}>
          Pokračovat
        </Button>
      </footer>
    </motion.form>
  )
}
