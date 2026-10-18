import { ListMagnifyingGlassIcon, PencilSimpleLineIcon, PlusIcon, XIcon } from '@phosphor-icons/react'
import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import type { Group, GroupFilter, TeamVariant } from '../../lib/data'
import { useAddMember, useGroupSearch, useGroups, useProjectScores } from '../../lib/queries'
import { cn } from '../../lib/utils/cn'
import { toPercent } from '../../lib/utils/format'
import { useDebounced } from '../../lib/utils/useDebounced'
import { dur, ease, spring } from '../../motion/presets'
import { ErrorNote } from '../system/ErrorNote'
import { ThinkingLine } from '../thinking/ThinkingLine'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { Tag } from '../ui/Tag'

type Mode = 'describe' | 'browse'

const MODES: { id: Mode; label: string; Icon: typeof PlusIcon }[] = [
  { id: 'describe', label: 'Popsat, koho hledám', Icon: PencilSimpleLineIcon },
  { id: 'browse', label: 'Vybrat ze seznamu', Icon: ListMagnifyingGlassIcon },
]

const NODES: NonNullable<GroupFilter['node']>[] = ['Praha', 'Brno', 'Olomouc']

const FIELD =
  'h-11 w-full rounded-full border border-line bg-card px-4 text-small text-text transition-colors duration-(--dur-hover) ease-(--ease-out) placeholder:text-text-muted hover:border-line-strong focus:border-orange-500 focus:outline-none'

/** Small ring that fills to the match; the number stays charcoal (orange text would fail AA at this size). */
function MatchRing({ value }: { value: number }) {
  const reduce = useReducedMotion()
  return (
    <span className="relative grid size-12 shrink-0 place-items-center" aria-label={`shoda ${toPercent(value)} %`}>
      <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="24" cy="24" r="20" fill="none" stroke="var(--line)" strokeWidth="3" />
        <motion.circle
          cx="24"
          cy="24"
          r="20"
          fill="none"
          stroke="var(--orange-500)"
          strokeWidth="3"
          strokeLinecap="round"
          initial={{ pathLength: reduce ? value : 0 }}
          animate={{ pathLength: value }}
          transition={{ duration: 0.6, ease }}
        />
      </svg>
      <span aria-hidden className="font-display text-[0.8rem] font-medium text-text">
        {toPercent(value)}
      </span>
    </span>
  )
}

/** Avatar that flies into the team row once added (shared layout id with GroupRow). */
export function FlyingAvatar({ group, className }: { group: Group; className?: string }) {
  return (
    <motion.span layoutId={`avatar-${group.id}`} transition={spring} className={cn('inline-flex shrink-0 rounded-full', className)}>
      <Avatar name={group.pi_name} src={group.photo_url} />
    </motion.span>
  )
}

interface CandidateProps {
  group: Group
  score: number
  /** Where the group would land in the team ranked by match (1-based). */
  rank: number
  teamSize: number
  busy: boolean
  index: number
  onAdd: () => void
}

function Candidate({ group, score, rank, teamSize, busy, index, onAdd }: CandidateProps) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, transition: { duration: dur.base, ease, delay: Math.min(index, 6) * 0.04 } }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: dur.micro } }}
      className="group/cand mb-2 flex h-[84px] snap-start items-center gap-3 rounded-[18px] bg-card px-3 py-2.5 pr-3.5 transition-shadow duration-(--dur-hover) hover:shadow-[inset_0_0_0_1px_var(--line-strong)]"
    >
      <FlyingAvatar group={group} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-medium text-text">{group.pi_name}</p>
        <p className="truncate text-small text-text-muted">
          {group.institution} · {group.node}
        </p>
        {group.tags && group.tags.length > 0 && (
          <div className="mt-1.5 flex min-w-0 gap-1.5">
            {group.tags.slice(0, 2).map((t) => (
              <Tag key={t} className="block max-w-[50%] truncate">
                {t}
              </Tag>
            ))}
          </div>
        )}
      </div>
      <MatchRing value={score} />
      {/* Where it lands: the team is ranked by match, so the place is known before adding. */}
      <span className="hidden w-[4.5rem] shrink-0 flex-col items-center text-center sm:flex">
        <span className="font-display text-heading leading-none font-medium text-text">{rank}.</span>
        <span className="mt-1 font-mono text-[0.625rem] tracking-[0.08em] text-text-muted uppercase">
          {rank > teamSize ? 'na konec' : 'místo v týmu'}
        </span>
      </span>
      <Button type="button" variant="accent" size="sm" ariaLabel={`Přidat ${group.pi_name} do týmu na ${rank}. místo`} disabled={busy} onClick={onAdd}>
        <PlusIcon size={18} weight="bold" aria-hidden />
      </Button>
    </motion.li>
  )
}

interface AddMemberProps {
  projectId: string
  /** From clarification: the project description to score against and the researcher's own group(s). */
  search: { query: string; exclude_slugs: string[] }
  variant: TeamVariant
  onAdded: (groupId: string) => void
}

/**
 * "Přidat dalšího člověka" at the end of the team: describe who is missing (semantic search
 * over the catalogue) or pick straight from the list of groups. Every candidate shows its match
 * with the project and the place it would take in the ranked team; on add its avatar flies in.
 */
export function AddMember({ projectId, search, variant, onAdded }: AddMemberProps) {
  const reduce = useReducedMotion()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('describe')
  const [text, setText] = useState('')
  const [node, setNode] = useState<GroupFilter['node']>()
  // An open role picked from the chips: the added group fills it and the gap disappears.
  const [gap, setGap] = useState<string | null>(null)
  const q = useDebounced(text.trim())
  const openRoles = variant.gaps.filter((g) => g.slot_key !== 'llm')

  const scores = useProjectScores(open ? search.query : undefined)
  const described = useGroupSearch(open && mode === 'describe' ? q : '')
  const listed = useGroups({ node })
  const add = useAddMember(projectId)

  // Never offer groups already in the team, nor the researcher's own group.
  const inTeam = new Set([...variant.members.map((m) => m.group_id), ...search.exclude_slugs])
  // The team's % comes from `/match` (fit to a role), candidates' from `/groups/search` (fit to the
  // whole brief) — the same group scores ~0.06 lower there. Shift candidates by the mean difference
  // measured on the current members, so "N. místo" compares like with like.
  const paired = variant.members.filter((m) => scores.data?.[m.group_id] !== undefined)
  const offset = paired.length ? paired.reduce((sum, m) => sum + m.total - scores.data![m.group_id], 0) / paired.length : 0
  const projectScore = (g: Group, fallback = 0) => Math.max(0, Math.min(1, (scores.data?.[g.id] ?? fallback) + offset))

  // Describe: ranked by how well the group fits the description. Browse: by match with the project.
  const candidates: { group: Group; score: number }[] =
    mode === 'describe'
      ? (described.data ?? []).filter((h) => !inTeam.has(h.item.id)).map((h) => ({ group: h.item, score: projectScore(h.item, h.score) }))
      : (listed.data ?? [])
          .filter((g) => !inTeam.has(g.id))
          .filter((g) => !q || `${g.pi_name} ${g.lab_name} ${g.institution} ${g.tags?.join(' ')}`.toLocaleLowerCase('cs').includes(q.toLocaleLowerCase('cs')))
          .map((g) => ({ group: g, score: projectScore(g) }))
          .sort((a, b) => b.score - a.score)

  const query = mode === 'describe' ? described : listed
  const waiting = mode === 'describe' ? q.length > 1 && described.isPending : listed.isPending
  const rankOf = (score: number) => 1 + variant.members.filter((m) => m.total >= score).length

  const pick = (group: Group, score: number) => {
    // A picked open role is the role; describing gives it in the user's words; from the list the
    // group's main expertise. The backend then explains the group in that role.
    const described = mode === 'describe' && q ? q.charAt(0).toLocaleUpperCase('cs') + q.slice(1) : ''
    const role = (gap ?? (described || group.tags?.[0] || 'Doplněný člen')).slice(0, 80)
    // Close on success so the person is seen landing in the team.
    add.mutate(
      { variantId: variant.id, input: { group, score, role, description: described || gap || undefined, fills_gap: gap ?? undefined } },
      {
        onSuccess: () => {
          onAdded(group.id)
          setGap(null)
          setOpen(false)
        },
      },
    )
  }

  return (
    <div className="mt-2">
      {/* The empty seat at the end of the team — opens the add dialog */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group/slot flex w-full items-center gap-4 rounded-[20px] border border-dashed border-line-strong px-3 py-3.5 text-left transition-colors duration-(--dur-hover) ease-(--ease-out) hover:border-orange-500 hover:bg-orange-50/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 sm:px-4"
      >
        {/* A dashed orbit around the plus, turning on hover (home orbit motif) */}
        <span className="relative grid size-11 shrink-0 place-items-center rounded-full bg-inset text-text-muted transition-colors group-hover/slot:bg-card group-hover/slot:text-orange-ink">
          <svg viewBox="0 0 44 44" aria-hidden className="absolute inset-0 transition-transform duration-[1200ms] ease-(--ease-out) group-hover/slot:rotate-90">
            <circle cx="22" cy="22" r="21" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="3 4" />
          </svg>
          <PlusIcon size={18} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-body font-medium text-text">Přidat dalšího člověka</span>
          <span className="block text-small text-text-muted">Popište, kdo týmu chybí, nebo vyberte ze skupin NÚVR</span>
        </span>
      </button>

      {/* Modal with a dimmed page behind it (Radix: focus trap, Esc, click outside, focus back) */}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <AnimatePresence>
          {open && (
            <Dialog.Portal forceMount>
              <Dialog.Overlay asChild forceMount>
                <motion.div
                  className="fixed inset-0 z-40 bg-charcoal-900/55"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: dur.base, ease }}
                />
              </Dialog.Overlay>
              <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center p-4">
                <Dialog.Content asChild forceMount>
                  <motion.section
                    className="pointer-events-auto w-full max-w-[680px] rounded-[28px] bg-card p-5 shadow-[0_40px_100px_-30px_rgb(29_29_31/0.6)] outline-none sm:p-6"
                    initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }}
                    animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
                    transition={{ duration: dur.slow, ease }}
                  >
                    <header className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <Dialog.Title className="font-display text-title font-medium text-text">Přidat dalšího člověka</Dialog.Title>
                        <Dialog.Description className="mt-1 text-small text-text-muted">
                          U každého vidíte shodu s projektem a místo, na které se v týmu zařadí.
                        </Dialog.Description>
                      </div>
                      <Dialog.Close asChild>
                        <Button type="button" variant="icon" size="sm" ariaLabel="Zavřít" title="Zavřít (Esc)">
                          <XIcon size={16} aria-hidden />
                        </Button>
                      </Dialog.Close>
                    </header>

                    <div role="tablist" aria-label="Způsob výběru" className="mb-3 flex w-fit flex-wrap gap-1 rounded-full bg-inset p-1">
                      {MODES.map(({ id, label, Icon }) => {
                        const active = mode === id
                        return (
                          <button
                            key={id}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => {
                              setMode(id)
                              setText('')
                              setGap(null)
                            }}
                            className={cn('relative flex h-9 items-center gap-2 rounded-full px-4 text-small font-medium transition-colors', active ? 'text-white' : 'text-text hover:text-orange-ink')}
                          >
                            {active && <motion.span layoutId="add-mode" className="absolute inset-0 rounded-full bg-charcoal-900" transition={spring} />}
                            <Icon size={16} aria-hidden className="relative" />
                            <span className="relative">{label}</span>
                          </button>
                        )
                      })}
                    </div>

                    {mode === 'describe' ? (
                      <>
                        <label className="block">
                          <span className="sr-only">Koho hledáte</span>
                          <input
                            autoFocus
                            value={text}
                            onChange={(e) => {
                              setText(e.target.value)
                              // Rewording means looking for someone else than the open role.
                              if (gap && e.target.value !== gap) setGap(null)
                            }}
                            placeholder="Koho týmu chybí? Např. neuropatolog s biobankou mozkových metastáz"
                            className={FIELD}
                          />
                        </label>
                        {openRoles.length > 0 && (
                          <div role="group" aria-label="Nepokryté role" className="mt-2 flex flex-wrap items-center gap-1.5">
                            <span className="text-[0.75rem] text-text-muted">Doplnit mezeru:</span>
                            {openRoles.map((g) => (
                              <button
                                key={g.slot_key}
                                type="button"
                                aria-pressed={gap === g.slot_key}
                                onClick={() => {
                                  setGap(g.slot_key)
                                  setText(g.slot_key)
                                }}
                                className={cn(
                                  'max-w-full truncate rounded-full px-3 py-1 text-[0.75rem] transition-colors duration-(--dur-hover) ease-(--ease-out)',
                                  gap === g.slot_key ? 'bg-charcoal-900 text-white' : 'bg-inset text-text hover:bg-panel',
                                )}
                              >
                                {g.slot_key}
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="min-w-[200px] flex-1">
                          <span className="sr-only">Filtrovat podle jména nebo expertizy</span>
                          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Jméno, pracoviště nebo expertiza" className={FIELD} />
                        </label>
                        <div role="group" aria-label="Uzel" className="flex gap-1">
                          {[undefined, ...NODES].map((n) => (
                            <button
                              key={n ?? 'all'}
                              type="button"
                              aria-pressed={node === n}
                              onClick={() => setNode(n)}
                              className={cn('h-11 rounded-full px-3.5 text-small transition-colors', node === n ? 'bg-charcoal-900 text-white' : 'bg-inset text-text hover:text-orange-ink')}
                            >
                              {n ?? 'Vše'}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Fixed height = three candidates; the rest scrolls inside, so the modal never jumps. */}
                    <div aria-live="polite" className="relative mt-3 h-[276px] rounded-[20px] bg-inset p-2">
                      {query.isError ? (
                        <ErrorNote message={query.error?.message} onRetry={() => void query.refetch()} />
                      ) : mode === 'describe' && q.length < 2 ? (
                        <div className="grid h-full place-items-center rounded-[16px] border border-dashed border-line-strong px-6 text-center">
                          <p className="max-w-[40ch] text-small text-text-muted">
                            Napište roli, metodu nebo téma. Najdu skupiny podle významu, ne jen podle slov.
                          </p>
                        </div>
                      ) : waiting ? (
                        <div className="grid h-full place-items-center rounded-[16px] border border-dashed border-line-strong">
                          <ThinkingLine stage="retrieval" />
                        </div>
                      ) : candidates.length === 0 ? (
                        <div className="grid h-full place-items-center rounded-[16px] border border-dashed border-line-strong px-6 text-center">
                          <p className="text-small text-text-muted">Nikoho dalšího jsem nenašel. Zkuste to popsat jinak.</p>
                        </div>
                      ) : (
                        <ul
                          aria-label={`${candidates.length} kandidátů`}
                          className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain pr-1 [mask-image:linear-gradient(to_bottom,black_calc(100%-28px),transparent)] [scrollbar-width:thin]"
                        >
                          <AnimatePresence initial={false} mode="popLayout">
                            {candidates.map(({ group, score }, i) => (
                              <Candidate
                                key={group.id}
                                group={group}
                                score={score}
                                rank={rankOf(score)}
                                teamSize={variant.members.length}
                                busy={add.isPending}
                                index={i}
                                onAdd={() => pick(group, score)}
                              />
                            ))}
                          </AnimatePresence>
                          {/* Room for the fade so the last candidate can scroll fully into view */}
                          <li aria-hidden className="h-6" />
                        </ul>
                      )}
                    </div>
                    {add.isPending && (
                      <div className="mt-2 px-1">
                        <ThinkingLine stage="compose" />
                      </div>
                    )}
                    {add.isError && (
                      <div className="mt-2">
                        <ErrorNote message={add.error.message} />
                      </div>
                    )}
                  </motion.section>
                </Dialog.Content>
              </div>
            </Dialog.Portal>
          )}
        </AnimatePresence>
      </Dialog.Root>
    </div>
  )
}
