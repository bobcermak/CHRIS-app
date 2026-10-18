import { ArrowLeftIcon, CheckIcon, CopyIcon } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import type { EmailDraft, Group } from '../../lib/data'
import { useEmailDraft } from '../../lib/queries'
import { pop } from '../../motion/presets'
import { ErrorNote } from '../system/ErrorNote'
import { ThinkingLine } from '../thinking/ThinkingLine'
import { Button } from '../ui/Button'
import { PanelCard } from '../ui/SidePanel'

interface EmailPanelProps {
  projectId: string
  group: Group
  onBack: () => void
}

const field =
  'w-full rounded-field border border-line bg-inset px-3.5 py-2.5 text-body text-text transition-colors hover:border-line-strong focus:border-line-strong focus:bg-card'

/** Collaboration e-mail draft to edit and copy. Never sent from CHRIS — ARCHITECTURE §8.5. */
export function EmailPanel({ projectId, group, onBack }: EmailPanelProps) {
  const draft = useEmailDraft(projectId, group.id, 'default')

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" variant="ghost" size="sm" ariaLabel="Zpět na profil" onClick={onBack}>
        <ArrowLeftIcon size={16} aria-hidden />
        Zpět na profil
      </Button>

      {draft.isPending ? (
        <PanelCard>
          <ThinkingLine stage="email" />
        </PanelCard>
      ) : draft.isError ? (
        <ErrorNote message="Koncept e-mailu se nepodařilo připravit." onRetry={() => void draft.refetch()} />
      ) : (
        // Re-mount on a new draft so edits start from the regenerated text.
        <EmailForm key={draft.dataUpdatedAt} draft={draft.data} group={group} />
      )}
    </div>
  )
}

interface EmailFormProps {
  draft: EmailDraft
  group: Group
}

function EmailForm({ draft, group }: EmailFormProps) {
  const [to, setTo] = useState(draft.to)
  const [subject, setSubject] = useState(draft.subject)
  const [body, setBody] = useState(draft.body)
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${subject}\n\n${body}`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <>
      <PanelCard>
        <h2 className="font-display text-title font-medium">E-mail pro {group.pi_name}</h2>
        <p className="mt-1 text-small text-text-muted">Koncept upravte podle sebe. CHRIS nic neodesílá.</p>
        <div className="mt-5 flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-small text-text-muted">Komu</span>
            <input type="email" value={to} onChange={(e) => setTo(e.target.value)} className={field} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-small text-text-muted">Předmět</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className={field} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="sr-only">Text e-mailu</span>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={11} className={`${field} resize-y leading-6`} />
          </label>
        </div>
      </PanelCard>

      <div className="flex flex-wrap gap-2 px-1 pt-1">
        <Button type="button" variant="outline" ariaLabel={copied ? 'Zkopírováno' : 'Kopírovat'} onClick={() => void copy()}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={copied ? 'ok' : 'copy'} variants={pop} initial="hidden" animate="show" exit="exit" className="inline-flex">
              {copied ? <CheckIcon size={20} className="text-ok" aria-hidden /> : <CopyIcon size={20} aria-hidden />}
            </motion.span>
          </AnimatePresence>
          <span aria-live="polite">{copied ? 'Zkopírováno' : 'Kopírovat'}</span>
        </Button>
      </div>
    </>
  )
}
