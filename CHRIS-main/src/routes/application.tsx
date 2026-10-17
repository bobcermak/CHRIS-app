import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { StackIcon } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { CopilotPanel } from '../components/application/CopilotPanel'
import { ExportDialog } from '../components/application/ExportDialog'
import { PrintDocument } from '../components/application/PrintDocument'
import { SectionEditor } from '../components/application/SectionEditor'
import { Reveal } from '../components/ui/Reveal'
import { TemplateConfirm } from '../components/application/TemplateConfirm'
import { TemplatePicker, type TemplateFit } from '../components/application/TemplatePicker'
import { NotFound } from '../components/system/Fallbacks'
import { Button } from '../components/ui/Button'
import { data } from '../lib/data'
import type { ApplicationDraft, ApplicationTemplate, CopilotComment, CopilotInput, CopilotResult, Strategy } from '../lib/data'
import { useApplication, useCacheWriters, useConfirmTemplate, useCreateApplication, useMatch, useProject, useSaveSection, useTemplate, useTemplates } from '../lib/queries'
import { useStream } from '../lib/stream/useStream'
import { AGENCY_LABEL, templateStatusLabel, UNVERIFIED_NOTICE } from '../lib/templates'
import { fadeUp } from '../motion/presets'
import { useProjectStore, type CopilotChatTurn } from '../stores/projectStore'

type Stage = { kind: 'library' } | { kind: 'confirm'; template: ApplicationTemplate }

export function ApplicationPage() {
  const { id } = useParams({ from: '/projekt/$id/prihlaska' })
  const search = useSearch({ from: '/projekt/$id/prihlaska' })
  const navigate = useNavigate({ from: '/projekt/$id/prihlaska' })
  const project = useProject(id)
  const match = useMatch(id)
  const library = useTemplates()
  const strategy = useProjectStore((s) => s.strategy[id] ?? 'INTELLIGENCE')
  const appId = useProjectStore((s) => s.applicationOf[id])
  const setApplication = useProjectStore((s) => s.setApplication)

  const app = useApplication(appId)
  const create = useCreateApplication()
  const confirm = useConfirmTemplate()
  const [stage, setStage] = useState<Stage>({ kind: 'library' })
  const [choosing, setChoosing] = useState(false)
  const [unassigned, setUnassigned] = useState<{ title: string; text: string }[]>([])

  const variant = match.data?.variants.find((v) => v.strategy === strategy)
  // For each template the team's best-fitting grant that uses it; the top one is recommended.
  const fits: Record<string, TemplateFit> = {}
  for (const g of variant?.grants ?? []) {
    const tid = g.call.template_id
    if (tid && (!fits[tid] || g.fit > fits[tid].fit)) fits[tid] = { fit: g.fit, callId: g.call.id, callName: g.call.name, url: g.call.url }
  }
  const recommendedId = Object.entries(fits).sort((a, b) => b[1].fit - a[1].fit)[0]?.[0]
  // The grant in the gauge on the teams page — always offered first, template or not.
  const featured = variant?.grants[0]
  // Grant the picked template is for (set by the picker; the featured grant may have no template).
  const chosenCall = useRef<string | undefined>(undefined)
  const wantsOtherCall = Boolean(search.grant && app.data && app.data.call_id !== search.grant)
  const showPicker = !appId || choosing || wantsOtherCall

  const createFrom = async (template: ApplicationTemplate) => {
    if (!variant) return
    const previous = app.data
    // The application belongs to the grant the template was recommended for, if any.
    const callId = chosenCall.current ?? fits[template.id]?.callId ?? search.grant ?? previous?.call_id
    const next = await create.mutateAsync({ projectId: id, variantId: variant.id, templateId: template.id, callId })
    // Switching templates: carry text over by section key; anything without a home is kept aside.
    if (previous) {
      const keys = new Set(next.sections.map((s) => s.key))
      const left: { title: string; text: string }[] = []
      for (const s of previous.sections) {
        if (!s.content_md.trim()) continue
        if (keys.has(s.key)) await data.saveSection(next.id, s.key, s.content_md)
        else left.push({ title: s.title, text: s.content_md })
      }
      setUnassigned(left)
    }
    setApplication(id, next.id)
    setChoosing(false)
    setStage({ kind: 'library' })
    // The URL follows the grant the application is now for; a stale ?grant= would read as
    // "wants another call" and reopen the picker.
    if (search.grant && search.grant !== next.call_id) {
      void navigate({ search: { grant: next.call_id || undefined }, replace: true })
    }
  }

  const onPick = (t: ApplicationTemplate, callId?: string) => {
    chosenCall.current = callId
    if (t.status === 'verified') void createFrom(t)
    else setStage({ kind: 'confirm', template: t })
  }

  if (project.isError) return <NotFound />
  if (match.isPending || (appId && app.isPending)) return null

  if (!match.data || !variant) {
    return (
      <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col justify-center gap-4 px-6 py-24">
        <h1 className="font-display text-display font-medium">Nejdřív sestavte tým</h1>
        <p className="text-body text-text-muted">Přihláška vychází z vybrané varianty týmu.</p>
        <Button href={`/projekt/${id}/upresneni`} variant="primary" ariaLabel="Pokračovat">
          Pokračovat
        </Button>
      </div>
    )
  }

  if (showPicker) {
    return stage.kind === 'confirm' ? (
      <TemplateConfirm
        template={stage.template}
        library={library.data ?? []}
        busy={create.isPending || confirm.isPending}
        onBack={() => setStage({ kind: 'library' })}
        onConfirm={async (sections) => {
          const t = await confirm.mutateAsync({ id: stage.template.id, sections })
          await createFrom(t)
        }}
      />
    ) : (
      <TemplatePicker
        recommendedId={recommendedId}
        fits={fits}
        featured={featured}
        busy={create.isPending}
        onPick={onPick}
      />
    )
  }

  if (!app.data) return <NotFound />

  return (
    <Editor
      key={app.data.id}
      app={app.data}
      title={match.data.intent.title}
      callName={variant.grants.find((g) => g.call.id === app.data!.call_id)?.call.name}
      unassigned={unassigned}
      onChangeTemplate={() => setChoosing(true)}
      library={library.data ?? []}
    />
  )
}

// ---------------------------------------------------------------------------------------------

/** File name of the exported application (the browser also uses the page title as a print name). */
function pdfName(title: string) {
  return `Přihláška – ${title}`.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 120)
}

/** Saves a Blob under a name: an object URL behind a temporary download link. */
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  // Revoked after the click has been handled.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Demo fallback (no backend): the browser's print dialog on the print-only document (A4,
 * index.css), "Uložit jako PDF". Waits two frames so the export dialog is gone from the page.
 */
function printPdf(title: string) {
  const pageTitle = document.title
  const restore = () => {
    document.title = pageTitle
  }
  window.addEventListener('afterprint', restore, { once: true })
  document.title = pdfName(title)
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      window.print()
      // Safari may skip "afterprint"; print() blocks until the dialog closes everywhere else.
      window.setTimeout(restore, 1000)
    }),
  )
}

/** Copilot edit: replace the quoted passage, or append as a new paragraph; null = quote not found. */
function applyEdit(content: string, quote: string | undefined, edit: string): string | null {
  if (quote) return content.includes(quote) ? content.replace(quote, () => edit.trim()) : null
  return content.trim() ? `${content.trimEnd()}

${edit.trim()}` : edit.trim()
}

/** What a copilot request is for. */
type CopilotRun = { kind: 'review' } | { kind: 'chat' } | { kind: 'write'; key: string } | { kind: 'revise'; key: string }

const NO_CHAT: CopilotChatTurn[] = []

interface EditorProps {
  app: ApplicationDraft
  title: string
  callName?: string
  unassigned: { title: string; text: string }[]
  library: ApplicationTemplate[]
  onChangeTemplate: () => void
}

function Editor({ app, title, callName, unassigned, library, onChangeTemplate }: EditorProps) {
  const template = useTemplate(app.template_id)
  const save = useSaveSection(app.id)
  const { refreshApplication } = useCacheWriters()
  const savedFeed = useProjectStore((s) => s.copilot[app.id])
  const saveFeed = useProjectStore((s) => s.setCopilot)
  const [initialFeed] = useState(savedFeed)
  const [feed, setFeed] = useState<CopilotResult | null>(initialFeed ?? null)
  useEffect(() => {
    if (feed) saveFeed(app.id, feed)
  }, [app.id, feed, saveFeed])
  const [highlight, setHighlight] = useState<{ key: string; n: number } | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const chat = useProjectStore((s) => s.copilotChat[app.id]) ?? NO_CHAT
  const setChat = useProjectStore((s) => s.setCopilotChat)

  // What the running copilot request is for — decides where its result goes and what the UI
  // shows meanwhile. The ref is read by the stream callback, the state drives rendering.
  const runRef = useRef<CopilotRun | null>(null)
  const [active, setActive] = useState<CopilotRun | null>(null)
  // The last request, for "Zkusit znovu".
  const lastRun = useRef<{ run: CopilotRun; input: CopilotInput } | null>(null)

  const copilot = useStream<CopilotResult>((result) => {
    const done = runRef.current
    if (result.section_patch) {
      void refreshApplication(app.id)
      setHighlight((h) => ({ key: result.section_patch!.section_key, n: (h?.n ?? 0) + 1 }))
      setFeed((f) => ({ score: f?.score, reply: f?.reply, comments: [...result.comments, ...(f?.comments ?? [])] }))
    } else if (done?.kind === 'revise') {
      // A review of one section: its fresh edits on top, the other sections' objections stay.
      setFeed((f) => ({
        score: result.score ?? f?.score,
        reply: result.reply,
        comments: [...result.comments, ...(f?.comments ?? []).filter((c) => c.section_key !== done.key)],
      }))
    } else {
      setFeed(result)
    }
    if (done?.kind === 'chat') {
      const reply =
        result.reply ||
        (result.comments.length ? `Posudek jsem aktualizoval, výtek: ${result.comments.length}.` : 'K tomu nemám co dodat.')
      const turns = useProjectStore.getState().copilotChat[app.id] ?? []
      setChat(app.id, [...turns, { role: 'assistant', text: reply }])
    }
    runRef.current = null
    setActive(null)
  })

  const start = useCallback(
    (run: CopilotRun, input: CopilotInput) => {
      runRef.current = run
      setActive(run)
      lastRun.current = { run, input }
      void copilot.start(data.copilot(app.id, input))
    },
    [app.id, copilot],
  )

  /** Copilot drafts a section (also the quick replies of its comments). */
  const write = (input: CopilotInput & { section_key: string }) => start({ kind: 'write', key: input.section_key }, input)

  /** "Upravit s copilotem": the opponent reviews one section and proposes concrete edits. */
  const revise = (key: string, title: string) =>
    start(
      { kind: 'revise', key },
      { mode: 'oppose', section_key: key, instruction: `Navrhni konkrétní úpravy sekce „${title}“, aby obstála před hodnoticím panelem.` },
    )

  /** A message in the copilot chat: shown right away, the reply follows under it. */
  const ask = (text: string) => {
    setChat(app.id, [...chat, { role: 'user', text }])
    start({ kind: 'chat' }, { mode: 'oppose', instruction: text })
  }

  // Oppose first (§9.4.1): the copilot reviews the draft as soon as it opens.
  const opposed = useRef<string | null>(null)
  useEffect(() => {
    if (opposed.current === app.id) return
    opposed.current = app.id
    // A restored review is shown as it was; otherwise review the draft now. (No `active` state:
    // a run without it is the whole-application review.)
    if (initialFeed) return
    const input: CopilotInput = { mode: 'oppose' }
    runRef.current = { kind: 'review' }
    lastRun.current = { run: { kind: 'review' }, input }
    void copilot.start(data.copilot(app.id, input))
  }, [app.id, copilot, initialFeed])

  const running = copilot.status === 'running'
  const writingKey = running && active?.kind === 'write' ? active.key : null
  const revisingKey = running && active?.kind === 'revise' ? active.key : null
  // The run that failed: on error `active` stays set until the next start.
  const failed = copilot.status === 'error' ? active : null

  const retry = () => {
    const last = lastRun.current
    if (last) start(last.run, last.input)
  }

  const required = app.sections.filter((s) => s.required)
  const done = required.filter((s) => s.content_md.trim()).length
  const unconfirmed = new Set(template.data?.sections.filter((s) => !s.confirmed).map((s) => s.key))
  const sectionTitle = (key: string) => app.sections.find((s) => s.key === key)?.title ?? key

  const focusSection = (key: string) => {
    const el = document.getElementById(`section-${key}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    document.getElementById(`section-${key}-text`)?.focus({ preventScroll: true })
  }

  const removeComment = (c: CopilotComment) =>
    setFeed((f) => (f ? { ...f, comments: f.comments.filter((x) => x.id !== c.id) } : f))

  const onOption = (c: CopilotComment, optionId: string) => {
    removeComment(c)
    if (optionId === 'write-dmp') write({ mode: 'write', section_key: 'dmp' })
    else write({ mode: 'write', section_key: c.section_key || 'team', instruction: `variant:${optionId as Strategy}` })
  }

  const scheme = template.data ? `${AGENCY_LABEL[template.data.agency]} · ${template.data.scheme}` : ''

  /** "Exportovat PDF": the backend renders the A4 PDF and it downloads; without one, print. */
  const exportPdf = async () => {
    const blob = await data.applicationPdf({
      title,
      // Scheme and call name often both start with the agency — each part once.
      subtitle: [...new Set([scheme, callName].filter(Boolean).join(' · ').split(' · '))].join(' · '),
      sections: app.sections.map((s) => ({ title: s.title, content_md: s.content_md })),
      notices: app.template_status !== 'verified' ? [UNVERIFIED_NOTICE] : [],
    })
    if (blob) download(blob, `${pdfName(title)}.pdf`)
    else printPdf(title)
  }

  return (
    <div className="flex-1 bg-canvas">
      <div className="no-print grid lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="mx-auto w-full max-w-[860px] px-5 pt-10 pb-24 sm:px-8">
          <motion.header variants={fadeUp} initial="hidden" animate="show" className="mb-6">
            <p className="font-mono text-meta tracking-[0.12em] text-text-muted uppercase">
              Přihláška · {template.data ? templateStatusLabel(template.data, library) : 'šablona'}
            </p>
            <h1 className="mt-2 font-display text-title font-medium">{callName ?? template.data?.scheme ?? 'Přihláška'}</h1>
            <p className="mt-1 text-small text-text-muted">{title}</p>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <p className="text-small text-text-muted">
                <span className="font-mono text-orange-ink tabular">
                  {done} / {required.length}
                </span>{' '}
                povinných bodů hotovo
              </p>
              <Button type="button" variant="outline" ariaLabel="Změnit šablonu" className="ml-auto" onClick={onChangeTemplate}>
                <StackIcon size={20} aria-hidden />
                Změnit šablonu
              </Button>
            </div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={required.length} aria-valuenow={done} aria-label="Hotové povinné body">
              <motion.div
                className="h-full rounded-full bg-orange-500"
                initial={false}
                animate={{ width: `${required.length ? (done / required.length) * 100 : 0}%` }}
                transition={{ duration: 0.4 }}
              />
            </div>
          </motion.header>

          {unassigned.length > 0 && (
            <div className="mb-5 rounded-[20px] border border-dashed border-line-strong bg-card px-5 py-4">
              <p className="text-small font-medium">Nezařazený text z předchozí šablony</p>
              <p className="mb-2 text-small text-text-muted">Tyto sekce nová šablona nemá. Text se neztratil, vložte ho, kam patří.</p>
              {unassigned.map((u) => (
                <details key={u.title} className="py-1 text-small">
                  <summary className="cursor-pointer text-text">{u.title}</summary>
                  <p className="mt-1 whitespace-pre-wrap text-text-muted">{u.text}</p>
                </details>
              ))}
            </div>
          )}

          <div className="rounded-card bg-card px-3 py-4 shadow-[0_1px_2px_rgb(29_29_31/0.04)] sm:px-6 sm:py-6">
            {app.sections.map((s, i) => (
              <Reveal key={s.key}>
              <SectionEditor
                key={`${s.key}-${highlight?.key === s.key ? highlight.n : 0}`}
                index={i}
                section={s}
                unconfirmed={unconfirmed.has(s.key)}
                highlight={highlight?.key === s.key}
                writing={writingKey === s.key}
                revising={revisingKey === s.key}
                copilotBusy={running}
                onSave={(content) => save.mutate({ key: s.key, content })}
                onWrite={() => write({ mode: 'write', section_key: s.key })}
                onRevise={() => revise(s.key, s.title)}
              />
              </Reveal>
            ))}
          </div>
          {/* Export comes after the document: the user reaches it once the application is read through. */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 px-2">
            <p className="max-w-[46ch] text-small text-text-muted">AI-assisted draft — oficiální podání pouze v ISVP/GRIS.</p>
            <Button type="button" variant="primary" ariaLabel="Exportovat PDF" onClick={() => setExportOpen(true)}>
              Exportovat PDF
            </Button>
          </div>
        </div>

        <div className="border-t border-line bg-card lg:sticky lg:top-[72px] lg:h-[calc(100dvh-72px)] lg:border-t-0 lg:border-l">
          <CopilotPanel
            result={feed}
            stream={copilot}
            chat={chat}
            chatBusy={running && active?.kind === 'chat'}
            chatError={failed?.kind === 'chat' ? copilot.error : undefined}
            sectionTitle={sectionTitle}
            onRetry={retry}
            onApply={(c) => {
              const s = app.sections.find((x) => x.key === c.section_key)
              if (!s || !c.suggested_edit) return removeComment(c)
              const content = applyEdit(s.content_md, c.quote, c.suggested_edit)
              // The quoted passage is gone (edited meanwhile): show the section, keep the comment.
              if (content === null) return focusSection(s.key)
              save.mutate({ key: s.key, content })
              setHighlight((h) => ({ key: s.key, n: (h?.n ?? 0) + 1 }))
              removeComment(c)
            }}
            onDismiss={removeComment}
            onOption={onOption}
            onFocusSection={focusSection}
            onInstruction={ask}
          />
        </div>
      </div>

      <PrintDocument app={app} title={title} scheme={scheme} callName={callName} />
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} app={app} template={template.data} onExport={exportPdf} />
    </div>
  )
}
