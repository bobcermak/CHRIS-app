import { MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { CatalogGrantPanel } from '../components/catalog/CatalogGrantPanel'
import { CatalogGroupPanel } from '../components/catalog/CatalogGroupPanel'
import { ErrorNote } from '../components/system/ErrorNote'
import { ThinkingLine } from '../components/thinking/ThinkingLine'
import { Percent } from '../components/ui/Percent'
import { SidePanel } from '../components/ui/SidePanel'
import { MonoLabel, Tag } from '../components/ui/Tag'
import type { GrantInfo, Group, GroupFilter, Scored } from '../lib/data'
import { useGrantSearch, useGrants, useGroupSearch, useGroups } from '../lib/queries'
import { cn } from '../lib/utils/cn'
import { formatDate, plural } from '../lib/utils/format'
import { useDebounced } from '../lib/utils/useDebounced'
import { fadeUp, spring } from '../motion/presets'

export type CatalogTab = 'skupiny' | 'granty'

const TABS: { id: CatalogTab; label: string }[] = [
  { id: 'skupiny', label: 'Výzkumné skupiny' },
  { id: 'granty', label: 'Grantové výzvy' },
]

const NODES: NonNullable<GroupFilter['node']>[] = ['Praha', 'Brno', 'Olomouc']

const FIELD =
  'h-11 rounded-full border border-line bg-card px-4 text-small text-text transition-colors duration-(--dur-hover) ease-(--ease-out) hover:border-line-strong focus:border-orange-500 focus:outline-none'

function Pill({ active, onClick, children, id }: { active: boolean; onClick: () => void; children: ReactNode; id?: string }) {
  return (
    <button
      id={id}
      type="button"
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      className={cn('relative h-10 rounded-full px-5 text-small font-medium transition-colors', active ? 'text-white' : 'bg-card text-text hover:bg-inset hover:text-orange-ink')}
    >
      {active && <motion.span layoutId="catalog-tab" className="absolute inset-0 rounded-full bg-charcoal-900" transition={spring} />}
      <span className="relative">{children}</span>
    </button>
  )
}

function ResultCard({ onOpen, label, title, meta, tags, score, index }: {
  onOpen: () => void
  label: string
  title: string
  meta: string
  tags?: string[]
  score?: number
  index: number
}) {
  return (
    <motion.li variants={fadeUp} initial="hidden" animate="show" custom={Math.min(index, 8)}>
      <button
        type="button"
        onClick={onOpen}
        className="group flex h-full w-full flex-col gap-3 rounded-card bg-card p-5 text-left transition-colors duration-(--dur-hover) ease-(--ease-out) hover:bg-panel focus-visible:bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
      >
        <div className="flex items-start justify-between gap-3">
          <MonoLabel className="tracking-[0.1em]">{label}</MonoLabel>
          {score !== undefined && <Percent value={score} size="sm" />}
        </div>
        <div>
          <h3 className="font-display text-heading font-medium text-text group-hover:text-orange-ink">{title}</h3>
          <p className="mt-1 text-small text-text-muted">{meta}</p>
        </div>
        {tags && tags.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1.5">
            {tags.slice(0, 3).map((t) => (
              <Tag key={t} className="block max-w-full truncate">
                {t}
              </Tag>
            ))}
          </div>
        )}
      </button>
    </motion.li>
  )
}

function Results<T>({ query, render, empty }: {
  query: { isPending: boolean; isError: boolean; error: Error | null; data: T[] | undefined; refetch: () => unknown }
  render: (item: T, i: number) => ReactNode
  empty: string
}) {
  if (query.isError) return <ErrorNote message={query.error?.message} onRetry={() => void query.refetch()} />
  if (query.isPending || !query.data) return <ThinkingLine stage="retrieval" />
  if (!query.data.length) return <p className="py-10 text-center text-body text-text-muted">{empty}</p>
  return <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{query.data.map(render)}</ul>
}

const groupCard = (open: (slug: string) => void) => (hit: Scored<Group> | Group, i: number) => {
  const g = 'item' in hit ? hit.item : hit
  return (
    <ResultCard
      key={g.slug}
      index={i}
      onOpen={() => open(g.slug)}
      label={`${g.node} · ${g.institution}`}
      title={g.pi_name}
      // Backend groups are named after their leader; then show the research programmes instead.
      meta={g.lab_name !== g.pi_name ? g.lab_name : g.programs.map((p) => p.split(' - ')[0]).join(' · ') || 'NÚVR'}
      tags={g.tags}
      score={'item' in hit ? hit.score : undefined}
    />
  )
}

const grantCard = (open: (slug: string) => void) => (hit: Scored<GrantInfo> | GrantInfo, i: number) => {
  const g = 'item' in hit ? hit.item : hit
  return (
    <ResultCard
      key={g.slug}
      index={i}
      onOpen={() => open(g.slug)}
      label={[g.agency, g.programme].filter(Boolean).join(' · ')}
      title={g.title}
      meta={g.deadline ? `Uzávěrka ${formatDate(g.deadline)}` : 'Uzávěrka neuvedena'}
      tags={g.keywords}
      score={'item' in hit ? hit.score : undefined}
    />
  )
}

/**
 * Catalogue of NÚVR research groups and grant calls (`/groups*`, `/grants*`): browse with
 * filters, or search by meaning (the backend ranks by similarity, shown as a percentage).
 */
export function CatalogPage() {
  const { tab = 'skupiny' } = useSearch({ from: '/katalog' })
  const navigate = useNavigate({ from: '/katalog' })
  const [text, setText] = useState('')
  const q = useDebounced(text.trim())
  const searching = q.length > 1

  const [node, setNode] = useState<GroupFilter['node']>()
  const [program, setProgram] = useState('')
  const [agency, setAgency] = useState('')
  const [open, setOpen] = useState<{ kind: CatalogTab; slug: string } | null>(null)

  const allGroups = useGroups({})
  const groups = useGroups({ node, program: program || undefined })
  const groupHits = useGroupSearch(tab === 'skupiny' ? q : '')
  const allGrants = useGrants(undefined)
  const grants = useGrants(agency || undefined)
  const grantHits = useGrantSearch(tab === 'granty' ? q : '')

  // Filter options come from the data itself, never from a hardcoded list.
  const programs = [...new Set(allGroups.data?.flatMap((g) => g.programs) ?? [])].sort()
  const agencies = [...new Set(allGrants.data?.map((g) => g.agency) ?? [])].sort()

  const total = tab === 'skupiny' ? allGroups.data?.length : allGrants.data?.length
  const openGroup = (slug: string) => setOpen({ kind: 'skupiny', slug })
  const openGrant = (slug: string) => setOpen({ kind: 'granty', slug })

  return (
    <div className="flex-1 bg-canvas-warm">
      <div className="mx-auto w-full max-w-[1280px] px-5 pt-10 pb-24 sm:px-8 sm:pt-14">
        <motion.header variants={fadeUp} initial="hidden" animate="show" className="mb-8">
          <p className="mb-2 font-mono text-meta tracking-[0.12em] text-text-muted uppercase">Katalog NÚVR</p>
          <h1 className="font-display text-display font-medium text-text">Skupiny a granty</h1>
          {total !== undefined && (
            <p className="mt-2 text-body text-text-muted">
              {tab === 'skupiny'
                ? `${total} ${plural(total, ['výzkumná skupina', 'výzkumné skupiny', 'výzkumných skupin'])} ze tří uzlů`
                : `${total} ${plural(total, ['grantová výzva', 'grantové výzvy', 'grantových výzev'])}`}
            </p>
          )}
        </motion.header>

        <div role="tablist" aria-label="Katalog" className="mb-5 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <Pill
              key={t.id}
              id={`catalog-${t.id}`}
              active={tab === t.id}
              onClick={() => {
                // A query typed for grants means nothing for groups (and vice versa).
                if (t.id !== tab) setText('')
                void navigate({ search: { tab: t.id }, replace: true })
              }}
            >
              {t.label}
            </Pill>
          ))}
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <label className="relative flex min-w-[260px] flex-1 items-center">
            <span className="sr-only">{tab === 'skupiny' ? 'Hledat skupinu' : 'Hledat grant'}</span>
            <MagnifyingGlassIcon size={18} aria-hidden className="pointer-events-none absolute left-4 text-text-muted" />
            <input
              type="search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={tab === 'skupiny' ? 'Téma, metoda nebo jméno — např. imunoterapie' : 'Téma nebo typ výzvy — např. prevence nádorů'}
              className={cn(FIELD, 'w-full pr-10 pl-11 [&::-webkit-search-cancel-button]:hidden')}
            />
            {text && (
              <button type="button" onClick={() => setText('')} aria-label="Vymazat hledání" className="absolute right-3 grid size-6 place-items-center rounded-full text-text-muted hover:bg-inset">
                <XIcon size={14} aria-hidden />
              </button>
            )}
          </label>

          {!searching && tab === 'skupiny' && (
            <>
              <div role="group" aria-label="Uzel" className="flex flex-wrap gap-1.5">
                {[undefined, ...NODES].map((n) => (
                  <button
                    key={n ?? 'all'}
                    type="button"
                    aria-pressed={node === n}
                    onClick={() => setNode(n)}
                    className={cn('h-11 rounded-full px-4 text-small transition-colors', node === n ? 'bg-charcoal-900 text-white' : 'bg-card text-text hover:bg-inset')}
                  >
                    {n ?? 'Všechny uzly'}
                  </button>
                ))}
              </div>
              <label>
                <span className="sr-only">Výzkumný program</span>
                <select value={program} onChange={(e) => setProgram(e.target.value)} className={cn(FIELD, 'max-w-[320px]')}>
                  <option value="">Všechny programy</option>
                  {programs.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          {!searching && tab === 'granty' && (
            <label>
              <span className="sr-only">Poskytovatel</span>
              <select value={agency} onChange={(e) => setAgency(e.target.value)} className={FIELD}>
                <option value="">Všichni poskytovatelé</option>
                {agencies.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <section aria-live="polite" aria-label="Výsledky">
          {tab === 'skupiny' ? (
            searching ? (
              <Results query={groupHits} render={groupCard(openGroup)} empty="Žádná skupina neodpovídá hledání." />
            ) : (
              <Results query={groups} render={groupCard(openGroup)} empty="Žádná skupina neodpovídá filtru." />
            )
          ) : searching ? (
            <Results query={grantHits} render={grantCard(openGrant)} empty="Žádná výzva neodpovídá hledání." />
          ) : (
            <Results query={grants} render={grantCard(openGrant)} empty="Žádná výzva od tohoto poskytovatele." />
          )}
        </section>
      </div>

      <SidePanel
        open={open !== null}
        onOpenChange={(o) => !o && setOpen(null)}
        title={open?.kind === 'granty' ? 'Grantová výzva' : 'Profil skupiny'}
      >
        {open?.kind === 'skupiny' && <CatalogGroupPanel slug={open.slug} />}
        {open?.kind === 'granty' && <CatalogGrantPanel slug={open.slug} />}
      </SidePanel>
    </div>
  )
}
