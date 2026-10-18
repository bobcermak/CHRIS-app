import { AnimatePresence, motion } from 'motion/react'
import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { ATTACHMENT_ACCEPT, type Attachment } from '../../lib/attachments'
import { cn } from '../../lib/utils/cn'
import { promptSchema } from '../../lib/validation/prompt'
import { ArrowUpIcon } from '@phosphor-icons/react'
import { Button } from '../ui/Button'
import { AttachmentChips } from './AttachmentChips'

export interface PromptComposerHandle {
  fill: (text: string) => void
  /** Adds text at the end of the prompt (links from the "+" menu). */
  append: (text: string) => void
  focus: () => void
  openFilePicker: () => void
}

interface PromptComposerProps {
  busy: boolean
  attachments: Attachment[]
  onAddFiles: (files: File[]) => void
  onRemoveAttachment: (id: string) => void
  onSubmit: (prompt: string) => void
  onFocusChange?: (focused: boolean) => void
  /** Error to show under the field (server or attachment validation). */
  error?: string | null
  /** The "+" control (menu). */
  plus: ReactNode
  /** One-line editor opened from the menu (link), shown above the text. */
  editor?: ReactNode
}

/** The prompt card on 01 Zadání: auto-growing field, attachments (drop, paste, picker), orange send. */
export const PromptComposer = forwardRef<PromptComposerHandle, PromptComposerProps>(function PromptComposer(
  { busy, attachments, onAddFiles, onRemoveAttachment, onSubmit, onFocusChange, error: outerError, plus, editor },
  ref,
) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useImperativeHandle(ref, () => ({
    fill: (text) => {
      setValue(text)
      setError(null)
      requestAnimationFrame(() => {
        area.current?.focus()
        area.current?.setSelectionRange(text.length, text.length)
      })
    },
    append: (text) => {
      // Space after the existing text (or a new line if it already ends with one), cursor at the end.
      const next = !value ? text : /\s$/.test(value) ? value + text : `${value} ${text}`
      setValue(next)
      setError(null)
      requestAnimationFrame(() => {
        area.current?.focus()
        area.current?.setSelectionRange(next.length, next.length)
      })
    },
    focus: () => area.current?.focus(),
    openFilePicker: () => fileInput.current?.click(),
  }))

  // Auto-grow between 3 and ~10 lines.
  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 280)}px`
  }, [value])

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (busy) return
    const parsed = promptSchema.safeParse(value)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Zadání není platné.')
      area.current?.focus()
      return
    }
    setError(null)
    onSubmit(parsed.data)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  // Ctrl+V of a file or screenshot attaches it; plain text pastes as usual.
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.files)
    if (!files.length) return
    e.preventDefault()
    onAddFiles(files)
  }

  const shownError = error ?? outerError
  const errorId = 'prompt-error'
  const hasChips = attachments.length > 0

  return (
    <form
      onSubmit={submit}
      className={cn(
        'relative w-full rounded-[22px] border bg-card shadow-[0_1px_2px_rgb(29_29_31/0.04),0_18px_50px_-24px_rgb(29_29_31/0.22)] transition-[border-color,box-shadow] duration-(--dur-hover) ease-(--ease-out)',
        shownError ? 'border-risk/50' : 'border-line hover:border-line-strong focus-within:border-orange-500 focus-within:shadow-[0_0_0_4px_var(--orange-50),0_24px_60px_-24px_rgb(255_94_31/0.28)]',
      )}
    >
      <AnimatePresence initial={false}>
        {hasChips && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap gap-1.5 px-5 pt-4">
              <AttachmentChips items={attachments} onRemove={onRemoveAttachment} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>{editor}</AnimatePresence>

      <label htmlFor="prompt" className="sr-only">
        Popište svůj výzkumný projekt
      </label>
      <textarea
        id="prompt"
        data-bare
        ref={area}
        value={value}
        rows={3}
        onChange={(e) => {
          setValue(e.target.value)
          if (error) setError(null)
        }}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onFocus={() => onFocusChange?.(true)}
        onBlur={() => onFocusChange?.(value.trim().length > 0)}
        placeholder="Popište svůj výzkumný projekt – cíl, metodu a co vám chybí…"
        aria-invalid={Boolean(shownError)}
        aria-describedby={shownError ? errorId : undefined}
        disabled={busy}
        className="block min-h-[76px] w-full resize-none bg-transparent px-6  pt-5 pb-2 text-body text-text placeholder:text-text-muted disabled:opacity-60"
      />

      <div className="flex items-center justify-between gap-3 px-4 pt-1 pb-4">
        <div className="flex min-w-0 items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={ATTACHMENT_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              onAddFiles(Array.from(e.target.files ?? []))
              e.target.value = ''
            }}
          />
          {plus}
        </div>
        <Button type="submit" variant="accent" size="sm" ariaLabel="Hledat" title="Odeslat zadání (Enter)" disabled={busy}>
          <ArrowUpIcon size={18} weight="bold" aria-hidden className="transition-transform group-hover:-translate-y-0.5" />
        </Button>
      </div>

      <AnimatePresence>
        {shownError && (
          <motion.p
            id={errorId}
            role="alert"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden px-6 pb-4 text-small text-risk"
          >
            {shownError}
          </motion.p>
        )}
      </AnimatePresence>
    </form>
  )
})
