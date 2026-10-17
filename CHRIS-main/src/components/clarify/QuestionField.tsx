import { useLayoutEffect, useRef } from 'react'
import type { ClarifyQuestion } from '../../lib/data'
import { cn } from '../../lib/utils/cn'

export interface AnswerValue {
  value: string | string[] | null
  unknown: boolean
}

interface QuestionFieldProps {
  index: number
  question: ClarifyQuestion
  answer: AnswerValue
  onChange: (next: AnswerValue) => void
  autoFocus?: boolean
}

/** One numbered question (01, 02, …) — free text or pill choices, always with "Nevím". */
export function QuestionField({ index, question, answer, onChange, autoFocus }: QuestionFieldProps) {
  const area = useRef<HTMLTextAreaElement>(null)
  const id = `q-${question.id}`
  const hasOptions = Boolean(question.options?.length)
  const text = typeof answer.value === 'string' ? answer.value : ''

  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 72), 220)}px`
  }, [text])

  const toggleOption = (optId: string) => {
    if (question.kind === 'multi_choice') {
      const current = Array.isArray(answer.value) ? answer.value : []
      const next = current.includes(optId) ? current.filter((x) => x !== optId) : [...current, optId]
      onChange({ value: next, unknown: false })
    } else {
      onChange({ value: answer.value === optId ? null : optId, unknown: false })
    }
  }

  const isSelected = (optId: string) =>
    Array.isArray(answer.value) ? answer.value.includes(optId) : answer.value === optId

  return (
    <fieldset className="grid grid-cols-[2rem_1fr] gap-x-3 px-5 py-6 sm:grid-cols-[2.5rem_1fr] sm:px-7" aria-describedby={`${id}-why`}>
      <span aria-hidden className="pt-0.5 font-mono text-small text-orange-ink tabular">
        {String(index + 1).padStart(2, '0')}
      </span>
      <div className="min-w-0">
        <legend className="font-display text-heading font-medium text-text">{question.text}</legend>
        <p id={`${id}-why`} className="mt-1 text-small text-text-muted">
          {question.why}
        </p>

        {question.impact_preview && (
          <p className="mt-2 font-mono text-meta text-text-muted">
            Zúží výběr z {question.impact_preview.before} na ~{question.impact_preview.after_estimate} skupin
          </p>
        )}

        {hasOptions ? (
          <div className="mt-4 flex flex-wrap gap-2" role={question.kind === 'multi_choice' ? 'group' : 'radiogroup'}>
            {question.options!.map((o) => {
              const selected = isSelected(o.id)
              return (
                <button
                  key={o.id}
                  type="button"
                  role={question.kind === 'multi_choice' ? 'checkbox' : 'radio'}
                  aria-checked={selected}
                  onClick={() => toggleOption(o.id)}
                  className={cn(
                    'h-9 rounded-full border px-4 text-small font-medium transition-colors',
                    selected ? 'border-charcoal-900 bg-charcoal-900 text-white' : 'border-line-strong bg-card text-text hover:border-charcoal-500 hover:bg-inset',
                  )}
                >
                  {o.label}
                </button>
              )
            })}
          </div>
        ) : (
          <>
            <label htmlFor={id} className="sr-only">
              Odpověď na otázku {index + 1}
            </label>
            <textarea
              id={id}
              ref={area}
              autoFocus={autoFocus}
              value={text}
              disabled={answer.unknown}
              onChange={(e) => onChange({ value: e.target.value, unknown: false })}
              placeholder={question.placeholder}
              className="mt-4 block w-full resize-none rounded-field border border-line bg-inset px-4 py-3 transition-colors hover:border-line-strong text-body text-text transition-colors placeholder:text-text-muted focus:border-line-strong focus:bg-card disabled:opacity-50"
            />
          </>
        )}

        <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-small text-text-muted select-none transition-colors hover:text-text">
          <input
            type="checkbox"
            checked={answer.unknown}
            onChange={(e) => onChange({ value: e.target.checked ? null : answer.value, unknown: e.target.checked })}
            className="size-4 accent-orange-500"
          />
          Nevím, nechám to na vás
        </label>
      </div>
    </fieldset>
  )
}
