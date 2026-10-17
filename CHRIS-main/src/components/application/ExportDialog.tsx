import * as Dialog from '@radix-ui/react-dialog'
import { motion } from 'motion/react'
import { useState } from 'react'
import type { ApplicationDraft, ApplicationTemplate } from '../../lib/data'
import { AI_DRAFT_NOTICE, UNVERIFIED_NOTICE } from '../../lib/templates'
import { dur, ease } from '../../motion/presets'
import { ErrorNote } from '../system/ErrorNote'
import { Button } from '../ui/Button'

interface ExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  app: ApplicationDraft
  template?: ApplicationTemplate
  /** Produces and saves the PDF; a rejection keeps the dialog open with the error. */
  onExport: () => Promise<void>
}

interface Item {
  text: string
  tone: 'risk' | 'gap' | 'stale'
}

/** Checklist for manual verification before export (§9.5): missing, over-limit, unconfirmed, unknown, diff. */
export function ExportDialog({ open, onOpenChange, app, template, onExport }: ExportDialogProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      // Closed first: the demo's print fallback must not print the dialog.
      onOpenChange(false)
      await onExport()
    } catch (e) {
      onOpenChange(true)
      setError(e instanceof Error ? e.message : 'Export se nepodařil.')
    } finally {
      setBusy(false)
    }
  }

  const items: Item[] = [
    ...app.sections
      .filter((s) => s.required && !s.content_md.trim())
      .map((s) => ({ text: `Povinná sekce „${s.title}“ je prázdná.`, tone: 'risk' as const })),
    ...app.sections
      .filter((s) => s.limits?.max_chars && s.content_md.length > s.limits.max_chars)
      .map((s) => ({ text: `Sekce „${s.title}“ překračuje limit ${s.limits!.max_chars} znaků.`, tone: 'risk' as const })),
    ...(template?.sections ?? [])
      .filter((s) => !s.confirmed)
      .map((s) => ({ text: `Sekce „${s.title}“ není potvrzená proti dokumentaci.`, tone: 'gap' as const })),
    ...(template?.unknown ?? []).map((u) => ({ text: `Neznámý limit: ${u}. Najděte ho v zadávací dokumentaci.`, tone: 'stale' as const })),
    ...(template?.diff ?? []).map((d) => ({ text: d, tone: 'gap' as const })),
  ]

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-charcoal-900/25" />
        <Dialog.Content asChild>
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: dur.base, ease }}
            className="fixed top-1/2 left-1/2 z-50 w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 rounded-card bg-card p-7 shadow-[0_40px_120px_-40px_rgb(29_29_31/0.45)] outline-none"
          >
            <Dialog.Title className="font-display text-title font-medium">Před exportem zkontrolujte</Dialog.Title>
            <Dialog.Description className="mt-2 text-body text-text-muted">
              Export je koncept. {AI_DRAFT_NOTICE}
            </Dialog.Description>

            {items.length ? (
              <ul className="mt-5 flex max-h-[45vh] flex-col gap-2 overflow-y-auto">
                {items.map((it) => (
                  <li key={it.text} className="flex gap-2.5 text-body">
                    <span
                      aria-hidden
                      className={`mt-2 size-1.5 shrink-0 rounded-full ${it.tone === 'risk' ? 'bg-risk' : it.tone === 'gap' ? 'bg-gap' : 'bg-stale'}`}
                    />
                    {it.text}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-5 flex items-center gap-2.5 text-body">
                <span aria-hidden className="size-1.5 rounded-full bg-ok" />
                Všechny povinné sekce jsou vyplněné a v limitech.
              </p>
            )}

            {app.template_status !== 'verified' && <p className="mt-4 text-small text-gap">{UNVERIFIED_NOTICE}</p>}
            {error && (
              <div className="mt-4">
                <ErrorNote message={error} onRetry={() => void run()} />
              </div>
            )}

            <div className="mt-7 flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="outline" ariaLabel="Zpět k úpravám">
                  Zpět k úpravám
                </Button>
              </Dialog.Close>
              <Button
                type="button"
                variant="primary"
                ariaLabel={items.length ? 'Exportovat i tak' : 'Exportovat PDF'}
                disabled={busy}
                onClick={() => void run()}
              >
                {items.length ? 'Exportovat i tak' : 'Exportovat PDF'}
              </Button>
            </div>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
