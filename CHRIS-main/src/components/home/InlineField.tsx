import { motion } from 'motion/react'
import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { dur, ease } from '../../motion/presets'
import { Button } from '../ui/Button'

interface InlineFieldProps {
  label: string
  placeholder: string
  /** Returns an error message, or null when the value was accepted. */
  onSubmit: (value: string) => string | null
  onCancel: () => void
}

/** Small one-line editor that slides into the composer (link, ORCID). Enter adds, Esc cancels. */
export function InlineField({ label, placeholder, onSubmit, onCancel }: InlineFieldProps) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    const problem = onSubmit(value)
    setError(problem)
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  }

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: dur.base, ease }}
      className="overflow-hidden"
    >
      <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
        <label className="flex min-w-[220px] flex-1 flex-col gap-1">
          <span className="font-mono text-meta tracking-[0.1em] text-text-muted uppercase">{label}</span>
          <input
            autoFocus
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              if (error) setError(null)
            }}
            onKeyDown={onKey}
            placeholder={placeholder}
            aria-invalid={Boolean(error)}
            className="h-10 rounded-full border border-line bg-inset px-4 text-small transition-colors duration-(--dur-hover) ease-(--ease-out) placeholder:text-text-muted hover:border-line-strong focus:border-line-strong focus:bg-card"
          />
        </label>
        <div className="flex gap-1.5 self-end">
          <Button type="button" variant="outline" size="sm" ariaLabel="Přidat" onClick={() => submit()}>
            Přidat
          </Button>
          <Button type="button" variant="ghost" size="sm" ariaLabel="Zrušit" onClick={onCancel}>
            Zrušit
          </Button>
        </div>
        {error && (
          <p role="alert" className="w-full text-small text-risk">
            {error}
          </p>
        )}
      </div>
    </motion.div>
  )
}
