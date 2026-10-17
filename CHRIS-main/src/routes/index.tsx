import { useNavigate } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { useRef, useState } from 'react'
import { DropOverlay } from '../components/home/DropOverlay'
import { InlineField } from '../components/home/InlineField'
import { OrbitField, type OrbitPhase } from '../components/home/OrbitField'
import { PlusMenu } from '../components/home/PlusMenu'
import { PromptComposer, type PromptComposerHandle } from '../components/home/PromptComposer'
import { RecentSessions } from '../components/home/RecentSessions'
import { ScienceFact } from '../components/home/ScienceFact'
import { useFileDrop } from '../components/home/useFileDrop'
import { toMeta, validateAttachment, withName, type Attachment } from '../lib/attachments'
import { EMPTY_CONTEXT, parseLink } from '../lib/composer'
import { useCreateProject } from '../lib/queries'
import { dur, ease, introUp } from '../motion/presets'
import { useSessionsStore } from '../stores/sessionsStore'

const CONVERGE_MS = 380

let attachmentSeq = 0

export function HomePage() {
  const navigate = useNavigate()
  const create = useCreateProject()
  const upsertSession = useSessionsStore((s) => s.upsert)
  const composer = useRef<PromptComposerHandle>(null)
  const [phase, setPhase] = useState<OrbitPhase>('idle')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const [editor, setEditor] = useState(false)

  const addFiles = (files: File[]) => {
    const errors: string[] = []
    const accepted: Attachment[] = []
    files.forEach((raw, i) => {
      const file = withName(raw, i)
      const problem = validateAttachment(file)
      if (problem) errors.push(problem)
      else accepted.push({ id: `att-${++attachmentSeq}`, file })
    })
    if (accepted.length) setAttachments((list) => [...list, ...accepted])
    setFileError(errors[0] ?? null)
  }

  const dragging = useFileDrop(addFiles, phase !== 'converge')

  const submit = async (prompt: string) => {
    const intent = await create.mutateAsync({ prompt, attachments: attachments.map(toMeta), ...EMPTY_CONTEXT })
    const lastPath = `/projekt/${intent.id}/upresneni`
    upsertSession({ id: intent.id, title: intent.title, lastPath })
    setPhase('converge')
    window.setTimeout(() => {
      void navigate({ to: '/projekt/$id/upresneni', params: { id: intent.id } })
    }, CONVERGE_MS)
  }

  return (
    <div className="relative isolate flex flex-1 flex-col items-center justify-center px-5 py-6">
      <OrbitField phase={dragging ? 'focus' : phase} />
      <DropOverlay active={dragging} />

      <motion.div
        className="flex w-full max-w-[760px] flex-col items-center"
        animate={phase === 'converge' ? { opacity: 0, y: -12 } : { opacity: 1, y: 0 }}
        transition={{ duration: dur.base, ease }}
      >
        <motion.p
          variants={introUp}
          initial="hidden"
          animate="show"
          custom={0}
          className="mb-4 text-center font-mono text-meta tracking-[0.12em] text-text-muted uppercase"
        >
          Collaborative Hub for Research Intelligence &amp; Synergy
        </motion.p>
        <h1 className="sr-only">Nový výzkumný projekt</h1>
        <ScienceFact />

        <motion.div variants={introUp} initial="hidden" animate="show" custom={3} className="w-full">
          <PromptComposer
            ref={composer}
            busy={create.isPending || phase === 'converge'}
            attachments={attachments}
            onAddFiles={addFiles}
            onRemoveAttachment={(id) => setAttachments((list) => list.filter((a) => a.id !== id))}
            onSubmit={(prompt) => void submit(prompt)}
            onFocusChange={(focused) => setPhase((p) => (p === 'converge' ? p : focused ? 'focus' : 'idle'))}
            error={create.isError ? 'Projekt se nepodařilo založit. Zkuste to prosím znovu.' : fileError}
            editor={
              editor && (
                <InlineField
                  label="Odkaz nebo DOI"
                  placeholder="https://… nebo 10.1038/…"
                  onCancel={() => {
                    setEditor(false)
                    composer.current?.focus()
                  }}
                  onSubmit={(raw) => {
                    const link = parseLink(raw)
                    if (typeof link === 'string') return link
                    setEditor(false)
                    composer.current?.append(link.kind === 'doi' ? `https://doi.org/${link.value}` : link.value)
                    return null
                  }}
                />
              )
            }
            plus={
              <PlusMenu
                disabled={create.isPending || phase === 'converge'}
                onUpload={() => composer.current?.openFilePicker()}
                onAddLink={() => setEditor(true)}
                onTemplate={(text) => composer.current?.fill(text)}
                onClosed={() => {
                  // The inline link editor takes focus itself.
                  requestAnimationFrame(() => {
                    if (!(document.activeElement instanceof HTMLInputElement)) composer.current?.focus()
                  })
                }}
              />
            }
          />
        </motion.div>

        <RecentSessions />
      </motion.div>
    </div>
  )
}
