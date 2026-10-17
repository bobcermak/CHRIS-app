import { ArrowUpRightIcon } from '@phosphor-icons/react'
import { useGrant } from '../../lib/queries'
import { formatDate } from '../../lib/utils/format'
import { ErrorNote } from '../system/ErrorNote'
import { ThinkingLine } from '../thinking/ThinkingLine'
import { Button } from '../ui/Button'
import { PanelCard } from '../ui/SidePanel'
import { MonoLabel, Tag } from '../ui/Tag'

/** Grant call detail in the catalogue side panel, loaded from `/grants/{slug}`. */
export function CatalogGrantPanel({ slug }: { slug: string }) {
  const query = useGrant(slug)

  if (query.isPending) return <ThinkingLine stage="grants" />
  if (query.isError) return <ErrorNote message={query.error.message} onRetry={() => void query.refetch()} />

  const grant = query.data
  const facts = [
    ['Uzávěrka', grant.deadline ? formatDate(grant.deadline) : ''],
    ['Rozpočet', grant.budget],
    ['Délka', grant.duration],
    ['Kód výzvy', grant.call_id],
    ['Kdo může žádat', grant.eligible_applicants],
  ].filter(([, value]) => value)

  return (
    <div className="flex flex-col gap-3">
      <PanelCard>
        <MonoLabel className="tracking-[0.1em]">{[grant.agency, grant.programme].filter(Boolean).join(' · ')}</MonoLabel>
        <h2 className="mt-1 font-display text-title font-medium">{grant.title}</h2>
        {grant.keywords && grant.keywords.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {grant.keywords.map((k) => (
              <Tag key={k}>{k}</Tag>
            ))}
          </div>
        )}
      </PanelCard>

      {facts.length > 0 && (
        <PanelCard>
          <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-small">
            {facts.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-text-muted">{label}</dt>
                <dd className="text-text">{value}</dd>
              </div>
            ))}
          </dl>
        </PanelCard>
      )}

      {grant.description && (
        <PanelCard>
          <MonoLabel className="tracking-[0.1em]">O výzvě</MonoLabel>
          <p className="mt-2 text-small leading-6 text-text">{grant.description}</p>
        </PanelCard>
      )}

      {grant.url && (
        <div className="px-1 pt-1">
          <Button href={grant.url} variant="outline" ariaLabel="Stránka výzvy">
            <ArrowUpRightIcon size={20} aria-hidden />
            Stránka výzvy
          </Button>
        </div>
      )}
    </div>
  )
}
