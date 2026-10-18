import { useRouter } from '@tanstack/react-router'
import { ArrowRightIcon, StackIcon, XIcon } from '@phosphor-icons/react'
import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { data } from '../../lib/data'
import { dur, ease, introUp } from '../../motion/presets'
import { Button } from '../ui/Button'
import { GROW_UNDERLINE } from '../ui/linkStyles'
import { useProjectStore } from '../../stores/projectStore'
import { resumePath, sortRecent, useSessionsStore, type Session } from '../../stores/sessionsStore'

const STEP: Record<string, string> = { upresneni: 'Upřesnění', tymy: 'Týmy', prihlaska: 'Přihláška' }

const time = new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit' })
const day = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' })

function when(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return `dnes ${time.format(d)}`
  if (d.toDateString() === yesterday.toDateString()) return `včera ${time.format(d)}`
  return day.format(d)
}

/** Recent projects on the home page — a click restores the exact step and URL. */
export function RecentSessions({ limit = 20 }: { limit?: number }) {
  const router = useRouter()
  const sessions = useSessionsStore((s) => s.sessions)
  const remove = useSessionsStore((s) => s.remove)
  const forget = useProjectStore((s) => s.forget)
  const recent = useMemo(() => sortRecent(sessions).slice(0, limit), [sessions, limit])
  const [expanded, setExpanded] = useState(false)

  if (!recent.length) return null

  const [latest, ...older] = recent

  const open = (path: string) => router.history.push(path)

  const drop = (id: string) => {
    remove(id)
    forget(id)
    void data.deleteProject(id).catch(() => {})
  }

  return (
    <section aria-label="Rozpracované projekty" className="mt-4 w-full">
      <ul className="flex flex-col">
        <SessionRow session={latest} index={0} onOpen={open} onDrop={drop} label="Naposledy" />
      </ul>

      {older.length > 0 && (
        <Dialog.Root open={expanded} onOpenChange={setExpanded}>
          <Dialog.Trigger asChild>
            <button
              type="button"
              className="group mx-4 mt-1 inline-flex items-center gap-1.5 rounded-full font-mono text-meta tracking-[0.1em] text-text-muted uppercase transition-colors hover:text-text"
            >
              <StackIcon size={14} aria-hidden className="transition-transform group-hover:-translate-y-0.5" />
              Další rozpracované ({older.length})
            </button>
          </Dialog.Trigger>
          <AnimatePresence>
            {expanded && (
              <Dialog.Portal forceMount>
                <Dialog.Overlay asChild forceMount>
                  <motion.div
                    className="fixed inset-0 z-40 bg-charcoal-900/20"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: dur.base, ease }}
                  />
                </Dialog.Overlay>
                {/* Centred with flex so the entrance animation owns the transform */}
                <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
                <Dialog.Content asChild forceMount>
                  <motion.div
                    // Unfolds from a band to its full shape (clip-path) — the content never scales or stretches
                    initial={{ opacity: 0, y: 12, clipPath: 'inset(42% 6% 42% 6% round 28px)' }}
                    animate={{ opacity: 1, y: 0, clipPath: 'inset(0% 0% 0% 0% round 28px)' }}
                    exit={{ opacity: 0, y: 8, clipPath: 'inset(42% 6% 42% 6% round 28px)' }}
                    className="pointer-events-auto flex max-h-[min(70dvh,560px)] w-[min(92vw,560px)] flex-col overflow-hidden rounded-card bg-card p-2 shadow-[0_40px_120px_-40px_rgb(29_29_31/0.45)] outline-none"
                    transition={{ duration: dur.slow, ease }}
                  >
                    <header className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
                      <Dialog.Title className="font-display text-title font-medium">Rozpracované projekty</Dialog.Title>
                      <Dialog.Close asChild>
                        <Button type="button" variant="icon" size="sm" ariaLabel="Zavřít" title="Zavřít (Esc)">
                          <XIcon size={16} aria-hidden />
                        </Button>
                      </Dialog.Close>
                    </header>
                    <Dialog.Description className="sr-only">Seznam projektů uložených v tomto prohlížeči</Dialog.Description>
                    <ul className="flex flex-col overflow-y-auto overscroll-contain pb-2">
                      {recent.map((s, i) => (
                        <SessionRow key={s.id} session={s} index={i} onOpen={open} onDrop={drop} />
                      ))}
                    </ul>
                  </motion.div>
                </Dialog.Content>
                </div>
              </Dialog.Portal>
            )}
          </AnimatePresence>
        </Dialog.Root>
      )}
    </section>
  )
}

interface SessionRowProps {
  session: Session
  index: number
  label?: string
  onOpen: (path: string) => void
  onDrop: (id: string) => void
}

function SessionRow({ session: s, index, label, onOpen, onDrop }: SessionRowProps) {
  // Reopens the furthest step reached, not merely the last one visited.
  const path = resumePath(s)
  const step = STEP[path.split('?')[0].split('/').pop() ?? '']
  return (
    <motion.li
      layout
      variants={introUp}
      initial="hidden"
      animate="show"
      exit={{ opacity: 0, x: -12, transition: { duration: 0.2 } }}
      custom={index + 4}
      className="group relative flex items-center gap-3 rounded-2xl px-4 py-2 transition-colors hover:bg-card/80"
    >
      {label && <span className="shrink-0 font-mono text-meta tracking-[0.1em] text-orange-ink uppercase">{label}</span>}
      <button
        type="button"
        onClick={() => onOpen(path)}
        aria-label={`${s.title}${step ? `, ${step}` : ''}`}
        className="flex min-w-0 flex-1 items-baseline gap-3 text-left after:absolute after:inset-0 after:rounded-2xl"
      >
        <span className={`truncate text-body text-text ${GROW_UNDERLINE}`}>{s.title}</span>
        <span className="shrink-0 font-mono text-meta text-text-muted">
          {step ? `${step} · ` : ''}
          {when(s.updatedAt)}
        </span>
      </button>
      <ArrowRightIcon
        size={16}
        aria-hidden
        className="shrink-0 -translate-x-1 text-orange-500 opacity-0 transition-[opacity,translate] group-hover:translate-x-0 group-hover:opacity-100"
      />
      <button
        type="button"
        onClick={() => onDrop(s.id)}
        aria-label={`Smazat projekt ${s.title}`}
        title="Smazat z tohoto prohlížeče"
        className="relative z-10 inline-flex size-7 shrink-0 items-center justify-center rounded-full text-text-muted opacity-0 transition-[opacity,color,background-color] group-hover:opacity-100 hover:bg-inset hover:text-text focus-visible:opacity-100"
      >
        <XIcon size={16} aria-hidden />
      </button>
    </motion.li>
  )
}
