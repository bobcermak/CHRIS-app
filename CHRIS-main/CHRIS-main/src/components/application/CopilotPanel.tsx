import { ArrowUpIcon, ShieldWarningIcon } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import logo from '../../assets/brand/logo.svg'
import type { CopilotComment, CopilotResult } from '../../lib/data'
import type { StreamState } from '../../lib/stream/useStream'
import type { CopilotChatTurn } from '../../stores/projectStore'
import { fadeUp } from '../../motion/presets'
import { ErrorNote } from '../system/ErrorNote'
import { ThinkingLine } from '../thinking/ThinkingLine'
import { Button } from '../ui/Button'
import { MonoLabel } from '../ui/Tag'

const SEVERITY_LABEL: Record<CopilotComment['severity'], string> = {
  blocker: 'Zásadní výtka',
  warning: 'Výtka',
  suggestion: 'Doporučení',
  info: 'Poznámka',
}

interface CopilotPanelProps {
  result: CopilotResult | null
  stream: Pick<StreamState<CopilotResult>, 'status' | 'stage' | 'verb' | 'pct' | 'error'>
  /** The conversation with the copilot, oldest first. */
  chat: CopilotChatTurn[]
  /** A chat message is being answered — the thinking line shows under it, not at the top. */
  chatBusy: boolean
  /** The last chat message failed; shown in the conversation with a retry. */
  chatError?: string
  sectionTitle: (key: string) => string
  onRetry: () => void
  onApply: (comment: CopilotComment) => void
  onDismiss: (comment: CopilotComment) => void
  onOption: (comment: CopilotComment, optionId: string) => void
  onFocusSection: (key: string) => void
  onInstruction: (text: string) => void
}

/**
 * The CHRIS copilot of the application: one opponent for the whole application (§9.4.1). It
 * reviews as a strict panel member — objections by severity, each tied to a section and a rule,
 * score per criterion — and answers questions in the chat below. No praise.
 */
export function CopilotPanel(props: CopilotPanelProps) {
  const { result, stream, chat, chatBusy, chatError, sectionTitle, onRetry, onApply, onDismiss, onOption, onFocusSection, onInstruction } = props
  const [text, setText] = useState('')
  const running = stream.status === 'running'
  const scroller = useRef<HTMLDivElement>(null)

  // New message, its thinking line or the reply → bring the end of the conversation into view.
  useEffect(() => {
    const el = scroller.current
    if (el && (chat.length || chatBusy)) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [chat.length, chatBusy, chatError])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim() || running) return
    onInstruction(text.trim())
    setText('')
  }

  return (
    <aside aria-label="Copilot" className="flex h-full min-w-0 flex-col overflow-x-hidden">
      <header className="flex items-center gap-3 border-b border-line px-5 py-4">
        <img src={logo} alt="CHRIS" width={64} height={22} className="h-[22px] w-auto" />
        <span aria-hidden className="h-4 w-px bg-line-strong" />
        <div className="min-w-0">
          <h2 className="font-mono text-meta tracking-[0.12em] text-text uppercase">Copilot</h2>
          <p className="truncate text-[0.75rem] text-text-muted">oponent celé přihlášky</p>
        </div>
      </header>

      <div ref={scroller} className="flex-1 overflow-y-auto px-5 py-5" aria-live="polite" aria-busy={running}>
        <AnimatePresence mode="popLayout">
          {running && !chatBusy && (
            <motion.div key="run" variants={fadeUp} initial="hidden" animate="show" exit="exit" className="mb-5">
              <ThinkingLine stage={stream.stage} verb={stream.verb} pct={stream.pct} />
            </motion.div>
          )}
        </AnimatePresence>

        {stream.status === 'error' && !chatError && (
          <div className="mb-5">
            <ErrorNote message={stream.error} onRetry={onRetry} />
          </div>
        )}

        {result?.score && (
          <motion.section variants={fadeUp} initial="hidden" animate="show" className="mb-6 rounded-[20px] bg-inset p-4">
            <div className="flex items-baseline justify-between">
              <MonoLabel>Odhad panelu</MonoLabel>
              <p className="font-display text-title font-medium tabular">
                {result.score.total}
                <span className="text-text-faint"> / 100</span>
              </p>
            </div>
            {result.score.general_criteria && (
              <p className="mt-1 text-[0.75rem] text-text-muted">Kritéria výzvy neznám, hodnotím obecnými kritérii.</p>
            )}
            <ul className="mt-3 flex flex-col gap-2.5">
              {result.score.criteria.map((c) => (
                <li key={c.name}>
                  <div className="flex items-baseline justify-between gap-3 text-small">
                    <span className="text-text">{c.name}</span>
                    <span className="font-mono text-meta text-text-muted tabular">
                      {c.score} / {c.max}
                    </span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-card" aria-hidden>
                    <motion.div
                      className="h-full rounded-full bg-charcoal-700"
                      initial={{ width: 0 }}
                      animate={{ width: `${(c.score / c.max) * 100}%` }}
                      transition={{ duration: 0.4 }}
                    />
                  </div>
                  <p className="mt-1 text-[0.75rem] leading-5 text-text-muted">{c.reason}</p>
                </li>
              ))}
            </ul>
          </motion.section>
        )}

        <ol className="flex flex-col gap-5">
          <AnimatePresence initial={false}>
            {result?.comments.map((c, i) => (
              <motion.li key={c.id} layout variants={fadeUp} initial="hidden" animate="show" exit="exit" custom={i}>
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <MonoLabel tone={c.severity === 'blocker' ? 'risk' : 'accent'}>
                    {c.mode === 'write' ? `Návrh textu · ${SEVERITY_LABEL[c.severity]}` : SEVERITY_LABEL[c.severity]}
                  </MonoLabel>
                  {c.section_key && (
                    <button type="button" onClick={() => onFocusSection(c.section_key)} className="text-small text-text-muted decoration-orange-500/60 underline-offset-4 transition-colors duration-(--dur-hover) ease-(--ease-out) hover:text-text hover:underline">
                      {sectionTitle(c.section_key)}
                    </button>
                  )}
                </div>
                <p className="text-body text-text">{c.text}</p>
                {c.criterion && (
                  <p className="mt-1 flex items-center gap-1.5 text-[0.75rem] text-text-muted">
                    <ShieldWarningIcon size={16} aria-hidden />
                    {c.criterion}
                  </p>
                )}
                {c.suggested_edit && (
                  // What exactly changes: the replaced passage struck through, the new text below.
                  <div className="mt-2 rounded-[14px] border border-line px-3 py-2 text-small">
                    {c.quote && <p className="text-text-muted line-through decoration-risk/60">{c.quote}</p>}
                    <p className={c.quote ? 'mt-1 text-text' : 'text-text'}>
                      {!c.quote && <span className="mr-1 font-mono text-meta text-text-muted uppercase">Doplnit:</span>}
                      {c.suggested_edit.trim()}
                    </p>
                  </div>
                )}
                {(c.suggested_edit || c.options?.length) && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {c.suggested_edit && (
                      <>
                        <Button type="button" size="sm" variant="outline" ariaLabel="Použít úpravu" onClick={() => onApply(c)}>
                          Použít úpravu
                        </Button>
                        <Button type="button" size="sm" variant="ghost" ariaLabel="Ponechat" onClick={() => onDismiss(c)}>
                          Ponechat
                        </Button>
                      </>
                    )}
                    {c.options?.map((o) => (
                      <Button key={o.id} type="button" size="sm" variant="outline" ariaLabel={o.label} onClick={() => onOption(c, o.id)} disabled={running}>
                        {o.label}
                      </Button>
                    ))}
                  </div>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>

        {/* The conversation sits at the end, right above the input, newest last. */}
        {(chat.length > 0 || chatBusy) && (
          <section aria-label="Konverzace s copilotem" className="mt-6 flex flex-col gap-2.5 border-t border-line pt-5">
            <AnimatePresence initial={false}>
              {chat.map((turn, i) =>
                turn.role === 'user' ? (
                  <motion.p
                    key={i}
                    variants={fadeUp}
                    initial="hidden"
                    animate="show"
                    className="ml-auto w-fit max-w-[90%] rounded-[16px] rounded-br-[6px] bg-charcoal-900 px-3.5 py-2 text-small whitespace-pre-wrap text-white"
                  >
                    {turn.text}
                  </motion.p>
                ) : (
                  <motion.div key={i} variants={fadeUp} initial="hidden" animate="show" className="max-w-[95%] rounded-[16px] rounded-bl-[6px] bg-inset px-4 py-3">
                    <MonoLabel tone="accent">Copilot</MonoLabel>
                    <p className="mt-1 text-body whitespace-pre-wrap text-text">{turn.text}</p>
                  </motion.div>
                ),
              )}
            </AnimatePresence>
            {chatBusy && <ThinkingLine stage={stream.stage} verb={stream.verb} pct={stream.pct} className="px-1" />}
            {chatError && <ErrorNote message={chatError} onRetry={onRetry} />}
          </section>
        )}
      </div>

      <form onSubmit={submit} className="border-t border-line p-4">
        <div className="flex items-end gap-2 rounded-[18px] border border-line bg-card p-2 transition-colors duration-(--dur-hover) ease-(--ease-out) focus-within:border-orange-500 hover:border-line-strong">
          <label htmlFor="copilot-input" className="sr-only">
            Zpráva pro copilota
          </label>
          <textarea
            id="copilot-input"
            data-bare
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) submit(e)
            }}
            placeholder="Na co se zpravodaj zeptá? Co mám zlepšit?"
            className="flex-1 resize-none bg-transparent px-2 py-1.5 text-small placeholder:text-text-muted"
          />
          <Button type="submit" variant="accent" size="sm" ariaLabel="Odeslat copilotovi" title="Odeslat (Enter)" disabled={running || !text.trim()}>
            <ArrowUpIcon size={18} weight="bold" aria-hidden />
          </Button>
        </div>
      </form>
    </aside>
  )
}
