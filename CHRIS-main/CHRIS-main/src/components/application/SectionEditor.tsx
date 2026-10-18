import { PencilSimpleLineIcon, PenNibIcon } from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ApplicationSection } from '../../lib/data'
import { cn } from '../../lib/utils/cn'
import { dur, ease } from '../../motion/presets'
import { Button } from '../ui/Button'
import { ThinkingLine } from '../thinking/ThinkingLine'

interface SectionEditorProps {
  index: number
  section: ApplicationSection
  /** Unconfirmed section of a non-verified template. */
  unconfirmed?: boolean
  /** Briefly highlights the section after copilot changed it. */
  highlight?: boolean
  writing?: boolean
  /** The copilot is reviewing this section for concrete edits. */
  revising?: boolean
  /** The copilot is busy with something else — its actions wait. */
  copilotBusy?: boolean
  onSave: (content: string) => void
  onWrite: () => void
  /** Ask the copilot for concrete edits of this section (they appear in the copilot panel). */
  onRevise: () => void
}

const SAVE_DELAY_MS = 600

/** One numbered section of the application: status, auto-growing text, character counter. */
export function SectionEditor({ index, section, unconfirmed, highlight, writing, revising, copilotBusy, onSave, onWrite, onRevise }: SectionEditorProps) {
  const [value, setValue] = useState(section.content_md)
  const [dirty, setDirty] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)
  const reduce = useReducedMotion()
  const id = `section-${section.key}`
  const max = section.limits?.max_chars
  const over = max !== undefined && value.length > max
  const empty = !value.trim()
  const aiDraft = section.ai_generated && !dirty && !empty

  // Copilot wrote into the section → take the new text unless the user is mid-edit.
  const [lastExternal, setLastExternal] = useState(section.content_md)
  if (section.content_md !== lastExternal) {
    setLastExternal(section.content_md)
    if (!dirty) setValue(section.content_md)
  }

  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, 96)}px`
  }, [value])

  // Debounced autosave.
  useEffect(() => {
    if (!dirty) return
    const t = window.setTimeout(() => {
      onSave(value)
      setDirty(false)
    }, SAVE_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [value, dirty, onSave])

  return (
    <section id={id} aria-labelledby={`${id}-title`} className="relative isolate scroll-mt-24 rounded-[20px] px-2 py-5 sm:px-4">
      {highlight && (
        <motion.span
          aria-hidden
          className="absolute inset-0 -z-10 rounded-[20px] bg-orange-50"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : dur.slow, ease, delay: 0.6 }}
        />
      )}
      <header className="mb-3 flex items-baseline gap-3">
        <span className="font-mono text-small text-text-muted tabular">{String(index + 1).padStart(2, '0')}</span>
        <h2 id={`${id}-title`} className="flex-1 font-display text-heading font-medium text-text">
          {section.title}
          {!section.required && <span className="ml-2 text-small font-normal text-text-muted">nepovinné</span>}
        </h2>
        <span
          className={cn(
            'rounded-md px-2 py-0.5 text-[0.75rem]',
            empty && section.required ? 'bg-orange-50 text-orange-ink' : 'bg-inset text-text-muted',
          )}
        >
          {empty ? (section.required ? 'Chybí' : 'Prázdné') : 'Hotovo'}
        </span>
      </header>

      {unconfirmed && <p className="mb-2 text-small text-gap">Sekce není potvrzená proti dokumentaci výzvy.</p>}
      {(writing || revising) && <ThinkingLine stage="write" className="mb-2 px-1" />}

      <label htmlFor={`${id}-text`} className="sr-only">
        {section.title}
      </label>
      <textarea
        id={`${id}-text`}
        ref={area}
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setDirty(true)
        }}
        placeholder={writing ? '' : 'Napište text sekce, nebo ho nechte navrhnout copilotem.'}
        aria-describedby={`${id}-count`}
        aria-invalid={over}
        className={cn(
          'block w-full resize-none rounded-field border px-4 py-3 text-body leading-7 text-text transition-colors placeholder:text-text-muted',
          aiDraft ? 'border-transparent bg-inset' : empty && section.required ? 'border-transparent bg-orange-50/40' : 'border-transparent bg-transparent hover:bg-inset focus:bg-inset',
          over && 'border-risk/60',
        )}
      />

      <footer className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1">
        <span className="font-mono text-meta text-text-muted uppercase" title="Po vaší úpravě se označení zruší">{aiDraft ? 'AI návrh' : ''}</span>
        <div className="flex items-center gap-3">
          {empty ? (
            <Button type="button" size="sm" variant="copilot" ariaLabel="Navrhnout s copilotem" title="Copilot navrhne text sekce z dat projektu a týmu" onClick={onWrite} disabled={writing || copilotBusy}>
              <PenNibIcon size={18} aria-hidden />
              Navrhnout s copilotem
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="copilot"
              ariaLabel="Upravit s copilotem"
              title="Copilot navrhne konkrétní úpravy této sekce; najdete je v panelu copilota"
              onClick={onRevise}
              disabled={revising || copilotBusy || dirty}
            >
              <PencilSimpleLineIcon size={18} aria-hidden />
              Upravit s copilotem
            </Button>
          )}
          <span id={`${id}-count`} className={cn('font-mono text-meta tabular transition-colors', over ? 'text-risk' : 'text-text-muted')}>
            {value.length.toLocaleString('cs-CZ')}
            {max ? ` / ${max.toLocaleString('cs-CZ')}` : ''} znaků
          </span>
        </div>
      </footer>
    </section>
  )
}
