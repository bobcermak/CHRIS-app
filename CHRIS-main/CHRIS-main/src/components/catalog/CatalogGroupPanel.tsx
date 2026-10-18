import { ArrowUpRightIcon, EnvelopeSimpleIcon } from '@phosphor-icons/react'
import { useGroup } from '../../lib/queries'
import { ErrorNote } from '../system/ErrorNote'
import { ThinkingLine } from '../thinking/ThinkingLine'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { PanelCard } from '../ui/SidePanel'
import { MonoLabel, Tag } from '../ui/Tag'

function Section({ title, items, limit }: { title: string; items: string[] | undefined; limit?: number }) {
  if (!items?.length) return null
  const shown = limit ? items.slice(0, limit) : items
  return (
    <PanelCard>
      <MonoLabel className="tracking-[0.1em]">{title}</MonoLabel>
      <ul className="mt-2 flex flex-col gap-1.5 text-small text-text">
        {shown.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {limit && items.length > limit && <p className="mt-2 text-small text-text-muted">a dalších {items.length - limit}</p>}
    </PanelCard>
  )
}

/** Group profile in the catalogue side panel, loaded from `/groups/{slug}`. */
export function CatalogGroupPanel({ slug }: { slug: string }) {
  const query = useGroup(slug)

  if (query.isPending) return <ThinkingLine stage="retrieval" />
  if (query.isError) return <ErrorNote message={query.error.message} onRetry={() => void query.refetch()} />

  const group = query.data
  return (
    <div className="flex flex-col gap-3">
      <PanelCard>
        <div className="flex items-start gap-4">
          <Avatar name={group.pi_name} src={group.photo_url} size="lg" />
          <div className="min-w-0 flex-1">
            <MonoLabel className="tracking-[0.1em]">Vedoucí skupiny</MonoLabel>
            <h2 className="mt-1 font-display text-title font-medium">{group.pi_name}</h2>
            {group.lab_name !== group.pi_name && <p className="mt-0.5 text-small text-text-muted">{group.lab_name}</p>}
            <p className="text-small text-text-muted">
              {group.institution} · {group.node}
            </p>
          </div>
        </div>
        {group.tags && group.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {group.tags.map((t) => (
              <Tag key={t}>{t}</Tag>
            ))}
          </div>
        )}
      </PanelCard>

      <Section title="Výzkumné programy" items={group.programs} />
      <Section title="Výzkum" items={group.dimensions.research?.items} />
      <Section title="Publikace" items={group.dimensions.output?.items} limit={5} />
      <Section title="Spolupráce" items={group.collaborations} limit={8} />
      <Section title="Infrastruktura" items={group.infrastructures} />

      <div className="flex flex-wrap gap-2 px-1 pt-1">
        {group.web_url && (
          <Button href={group.web_url} variant="outline" ariaLabel="Profil skupiny na webu">
            <ArrowUpRightIcon size={20} aria-hidden />
            Profil skupiny na webu
          </Button>
        )}
        {group.email && (
          <Button href={`mailto:${group.email}`} variant="ghost" ariaLabel={`E-mail ${group.email}`}>
            <EnvelopeSimpleIcon size={20} aria-hidden />
            {group.email}
          </Button>
        )}
      </div>
    </div>
  )
}
