import { ArrowUpRightIcon } from '@phosphor-icons/react'
import type { GrantMatch } from '../../lib/data'
import { useGrant } from '../../lib/queries'
import { formatDate } from '../../lib/utils/format'
import { Button } from '../ui/Button'
import { Percent } from '../ui/Percent'
import { PanelCard } from '../ui/SidePanel'
import { MonoLabel, Tag } from '../ui/Tag'
import { ResearchBlock } from './ResearchBlock'

interface GrantPanelProps {
  projectId: string
  grant: GrantMatch
}

/** Grant detail in the team side panel: fit, metadata, call description, link, deep research. */
export function GrantPanel({ projectId, grant }: GrantPanelProps) {
  // Fresh details from `/grants/{slug}`; the title/provider from the match show instantly meanwhile.
  const detail = useGrant(grant.call.id).data
  const title = detail?.title || grant.call.name
  const agency = detail?.agency || grant.call.provider
  const programme = detail?.programme
  const header = [agency, programme].filter(Boolean).join(' · ')
  const facts: [string, string | undefined][] = [
    ['Uzávěrka', (detail?.deadline ?? grant.call.deadline) ? formatDate(detail?.deadline ?? grant.call.deadline) : ''],
    ['Rozpočet', detail?.budget],
    ['Délka', detail?.duration],
    ['Kód výzvy', detail?.call_id],
    ['Kdo může žádat', detail?.eligible_applicants],
  ]
  const shownFacts = facts.filter(([, v]) => v) as [string, string][]
  const url = detail?.url || grant.call.url

  return (
    <div className="flex flex-col gap-3">
      <PanelCard>
        {header && <MonoLabel className="tracking-[0.1em]">{header}</MonoLabel>}
        <h2 className="mt-1 font-display text-title font-medium">{title}</h2>
        <div className="mt-5 flex items-baseline gap-2 border-t border-line pt-4">
          <Percent value={grant.fit} size="xl" label="shoda se zadáním" className="!text-[2.75rem]" />
          <span className="text-small text-text-muted">shoda se zadáním</span>
        </div>
        {detail?.keywords && detail.keywords.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {detail.keywords.map((k) => (
              <Tag key={k}>{k}</Tag>
            ))}
          </div>
        )}
      </PanelCard>

      {shownFacts.length > 0 && (
        <PanelCard>
          <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-small">
            {shownFacts.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-text-muted">{label}</dt>
                <dd className="text-text">{value}</dd>
              </div>
            ))}
          </dl>
        </PanelCard>
      )}

      {detail?.description && (
        <PanelCard>
          <MonoLabel className="tracking-[0.1em]">O výzvě</MonoLabel>
          <p className="mt-2 text-small leading-6 text-text">{detail.description}</p>
        </PanelCard>
      )}

      <ResearchBlock
        projectId={projectId}
        target={{ kind: 'grant', id: grant.call.id }}
        subtitle="Historie předchozích kol, úspěšnost a typičtí vítězové"
      />

      {url && (
        <div className="px-1 pt-1">
          <Button href={url} variant="outline" ariaLabel="Stránka výzvy">
            <ArrowUpRightIcon size={20} aria-hidden />
            Stránka výzvy
          </Button>
        </div>
      )}
    </div>
  )
}
