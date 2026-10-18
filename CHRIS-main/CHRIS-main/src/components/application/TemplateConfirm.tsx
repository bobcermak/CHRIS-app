import { TrashIcon } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import type { ApplicationTemplate, TemplateCitation, TemplateSection } from '../../lib/data'
import { templateStatusLabel } from '../../lib/templates'
import { fadeUp } from '../../motion/presets'
import { Button } from '../ui/Button'
import { Card, CardHeader, Inset } from '../ui/Card'
import { ExternalIconLink } from '../ui/ExternalIconLink'

/** Only web links are rendered as links; anything else from the data stays plain text. */
const webUrl = (url: string) => (/^https?:\/\//i.test(url) ? url : undefined)

/** Where in the call documentation a section stands: "str. 4" links to the page when it can. */
function SourceRefs({ ids, byId }: { ids: string[]; byId: Map<string, TemplateCitation> }) {
  const refs = ids.map((id) => byId.get(id)).filter((c): c is TemplateCitation => Boolean(c))
  if (refs.length === 0) return null
  return (
    <span className="flex flex-wrap items-center gap-x-2 px-1 font-mono text-[0.6875rem] tracking-[0.04em] text-text-muted">
      <span className="uppercase">Zdroj</span>
      {refs.map((c) => {
        const href = webUrl(c.url)
        return href ? (
          <a
            key={c.id}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title={c.snippet || undefined}
            className="text-info underline decoration-line-strong underline-offset-2 transition-colors duration-(--dur-hover) ease-(--ease-out) hover:decoration-info"
          >
            {c.label}
          </a>
        ) : (
          <span key={c.id} title={c.snippet || undefined}>
            {c.label}
          </span>
        )
      })}
    </span>
  )
}

interface TemplateConfirmProps {
  template: ApplicationTemplate
  library: ApplicationTemplate[]
  busy: boolean
  onConfirm: (sections: TemplateSection[]) => void
  onBack: () => void
}

/**
 * Human confirmation for derived / extracted / generic templates (§9.5): confirm, rename or delete
 * sections; unknown limits and possible differences are listed. Drafting works without it, but
 * Check and export will flag unconfirmed parts.
 */
export function TemplateConfirm({ template, library, busy, onConfirm, onBack }: TemplateConfirmProps) {
  const [sections, setSections] = useState(template.sections)
  const confirmed = sections.filter((s) => s.confirmed).length
  const byId = new Map((template.citations ?? []).map((c) => [c.id, c]))
  const sourceUrl = webUrl(template.source_url)

  const update = (key: string, patch: Partial<TemplateSection>) =>
    setSections((list) => list.map((s) => (s.key === key ? { ...s, ...patch } : s)))

  return (
    <div className="mx-auto w-full max-w-[880px] px-5 pt-12 pb-24 sm:pt-16">
      <motion.header variants={fadeUp} initial="hidden" animate="show" className="mb-8">
        <p className="mb-2 font-mono text-meta tracking-[0.12em] text-text-muted uppercase">Přihláška · potvrzení šablony</p>
        <h1 className="font-display text-display font-medium">{templateStatusLabel(template, library)}</h1>
        <p className="mt-3 max-w-[62ch] text-body text-text-muted">
          Šablona nebyla ověřena proti oficiální dokumentaci. Projděte sekce, ponechte jen ty, které výzva opravdu vyžaduje, a
          potvrďte je. Nepotvrzené části označím při kontrole i v exportu.
        </p>
        {sourceUrl && (
          <p className="mt-3 flex items-center gap-2 text-small text-text-muted">
            Dokumentace výzvy: <span className="truncate">{new URL(sourceUrl).hostname}</span>
            <ExternalIconLink href={sourceUrl} label="Dokumentace výzvy" />
          </p>
        )}
        {template.warning && (
          <p role="status" className="mt-4 flex max-w-[62ch] gap-2.5 rounded-inset bg-card px-4 py-3 text-small text-text">
            <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-gap" />
            {template.warning}
          </p>
        )}
      </motion.header>

      {(template.diff?.length || template.unknown.length) ? (
        <Card className="mb-5">
          {template.diff && template.diff.length > 0 && (
            <>
              <h2 className="mb-2 font-display text-heading font-medium">V čem se výzva může lišit</h2>
              <ul className="mb-5 flex flex-col gap-1.5">
                {template.diff.map((d) => (
                  <li key={d} className="flex gap-2.5 text-body">
                    <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-gap" />
                    {d}
                  </li>
                ))}
              </ul>
            </>
          )}
          {template.unknown.length > 0 && (
            <>
              <h2 className="mb-2 font-display text-heading font-medium">Co nevím a musíte doplnit</h2>
              <ul className="flex flex-col gap-1.5">
                {template.unknown.map((u) => (
                  <li key={u} className="flex gap-2.5 text-body">
                    <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-stale" />
                    {u}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      ) : null}

      <Card aria-labelledby="sections-title">
        <CardHeader id="sections-title" title="Sekce přihlášky" aside={`${confirmed} / ${sections.length} potvrzeno`} />
        <ul className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {sections.map((s, i) => (
              <motion.li key={s.key} layout exit={{ opacity: 0, x: -16 }}>
                <Inset className="flex items-center gap-3 px-4 py-3">
                  <span className="w-6 font-mono text-small text-text-muted tabular">{String(i + 1).padStart(2, '0')}</span>
                  <label className="flex min-w-0 flex-1 flex-col">
                    <span className="sr-only">Název sekce {i + 1}</span>
                    <input
                      value={s.title}
                      onChange={(e) => update(s.key, { title: e.target.value })}
                      className="w-full rounded-lg bg-transparent px-1 py-0.5 text-body font-medium text-text focus:bg-card"
                    />
                    <span className="px-1 text-small text-text-muted">{s.hint}</span>
                    <SourceRefs ids={s.citation_ids} byId={byId} />
                  </label>
                  <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 text-small text-text-muted">
                    <input
                      type="checkbox"
                      checked={s.confirmed}
                      onChange={(e) => update(s.key, { confirmed: e.target.checked })}
                      className="size-4 accent-orange-500"
                    />
                    Potvrzeno
                  </label>
                  <Button
                    type="button"
                    variant="icon"
                    size="sm"
                    ariaLabel={`Odebrat sekci ${s.title}`}
                    title="Odebrat sekci"
                    onClick={() => setSections((list) => list.filter((x) => x.key !== s.key))}
                  >
                    <TrashIcon size={16} aria-hidden />
                  </Button>
                </Inset>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="ghost" size="sm" ariaLabel="Zpět na knihovnu" onClick={onBack}>
            Zpět na knihovnu
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" ariaLabel="Potvrdit vše" disabled={busy} onClick={() => onConfirm(sections.map((s) => ({ ...s, confirmed: true })))}>
              Potvrdit vše
            </Button>
            <Button type="button" variant="primary" ariaLabel="Pokračovat k přihlášce" disabled={busy || sections.length === 0} onClick={() => onConfirm(sections)}>
              Pokračovat k přihlášce
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
