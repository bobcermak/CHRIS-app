import { EnvelopeSimpleIcon, MapPinIcon } from '@phosphor-icons/react'
import type { Group, TechResource } from '../../lib/data'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { PanelCard } from '../ui/SidePanel'
import { ResearchBlock } from './ResearchBlock'

interface TechPanelProps {
  projectId: string
  tech: TechResource
  groups: Record<string, Group>
  onEmail: (groupId: string) => void
}

/** Technology detail: where it can be done, through which groups of the team, and how to reach them. */
export function TechPanel({ projectId, tech, groups, onEmail }: TechPanelProps) {
  const via = (tech.group_ids ?? []).map((id) => groups[id]).filter(Boolean)

  return (
    <div className="flex flex-col gap-3">
      <PanelCard>
        <p className="font-mono text-meta tracking-[0.1em] text-text-muted uppercase">Technologie</p>
        <h2 className="mt-1 font-display text-title font-medium">{tech.name}</h2>
        {tech.description && (
          <p className="mt-2 text-small leading-6 text-text-muted">{tech.description}</p>
        )}
        <h3 className="mt-5 mb-2 font-display text-heading font-medium">Kde to jde dělat</h3>
        <p className="flex items-start gap-2 text-body text-text">
          <MapPinIcon size={20} weight="fill" className="mt-0.5 shrink-0 text-orange-500" aria-hidden />
          <span>
            {tech.where.institution}
            {tech.where.node && !tech.where.institution.includes(tech.where.node) ? `, ${tech.where.node}` : ''}
            {tech.where.infrastructure ? ` · infrastruktura ${tech.where.infrastructure}` : ''}
          </span>
        </p>
        <p className="mt-3 text-small text-text-muted">{tech.access}</p>
      </PanelCard>

      {via.length > 0 && (
        <PanelCard>
          <h3 className="mb-3 font-display text-heading font-medium">Přes koho z týmu</h3>
          <ul className="flex flex-col gap-2">
            {via.map((g) => (
              <li key={g.id} className="flex items-center gap-3 rounded-[16px] bg-inset px-3 py-2.5">
                <Avatar name={g.pi_name} src={g.photo_url} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-small font-medium text-text">{g.pi_name}</span>
                  <span className="block truncate text-[0.75rem] text-text-muted">
                    {g.institution} · {g.node}
                  </span>
                </span>
                <Button type="button" variant="outline" size="sm" ariaLabel={`Napsat ${g.pi_name}`} onClick={() => onEmail(g.id)}>
                  <EnvelopeSimpleIcon size={16} aria-hidden />
                  Napsat
                </Button>
              </li>
            ))}
          </ul>
        </PanelCard>
      )}

      <ResearchBlock projectId={projectId} target={{ kind: 'tech', id: tech.id }} subtitle="Alternativy a srovnání z literatury" />
    </div>
  )
}
