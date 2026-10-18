import { EnvelopeSimpleIcon } from '@phosphor-icons/react'
import type { Citation, Group, Member } from '../../lib/data'
import { useGroup } from '../../lib/queries'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { Percent } from '../ui/Percent'
import { PanelCard } from '../ui/SidePanel'
import { Tag } from '../ui/Tag'
import { Claims, SourceList } from './Claims'
import { ResearchBlock } from './ResearchBlock'

interface GroupPanelProps {
  projectId: string
  group: Group
  member?: Member
  citations: Record<string, Citation>
  onEmail: () => void
  onReplace?: () => void
}

/** Group profile in the side panel: why it fits (with sources), deep research, e-mail to the leader. */
export function GroupPanel({ projectId, group: fromMatch, member, citations, onEmail }: GroupPanelProps) {
  // Fresh profile from `/groups/{slug}`; the copy from the match shows instantly meanwhile.
  const group = useGroup(fromMatch.slug, fromMatch).data ?? fromMatch
  // Fresh numbering each render: claims register their sources, the list below reads them.
  const numbering = new Map<string, number>()

  return (
    <div className="flex flex-col gap-3">
      <PanelCard>
        <div className="flex items-start gap-4">
          <Avatar name={group.pi_name} src={group.photo_url} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-meta tracking-[0.1em] text-text-muted uppercase">Vedoucí skupiny</p>
            <h2 className="mt-1 font-display text-title font-medium">{group.pi_name}</h2>
            <p className="mt-0.5 text-small text-text-muted">{[group.institution, group.department].filter(Boolean).join(' · ')}</p>
            <p className="text-small text-text-muted">
              {group.lab_name}
              {group.size ? ` · ${group.size} lidí` : ''} · {group.node}
            </p>
          </div>
        </div>
        {member && (
          <div className="mt-5 flex items-baseline gap-2 border-t border-line pt-4">
            <Percent value={member.total} size="xl" label="shoda se zadáním" className="!text-[2.75rem]" />
            <span className="text-small text-text-muted">shoda se zadáním</span>
          </div>
        )}
        {group.tags && group.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {group.tags.map((t) => (
              <Tag key={t}>{t}</Tag>
            ))}
          </div>
        )}
      </PanelCard>

      {member && (
        <PanelCard>
          <h3 className="mb-2 font-display text-heading font-medium">Proč se hodí</h3>
          <Claims claims={member.explanation.why} citations={citations} numbering={numbering} />
          {member.explanation.benefit.length > 0 && (
            <>
              <h4 className="mt-4 mb-1.5 font-mono text-meta tracking-[0.1em] text-text-muted uppercase">Přínos</h4>
              <Claims claims={member.explanation.benefit} citations={citations} numbering={numbering} />
            </>
          )}
          {member.explanation.first_step.length > 0 && (
            <>
              <h4 className="mt-4 mb-1.5 font-mono text-meta tracking-[0.1em] text-text-muted uppercase">První krok</h4>
              <Claims claims={member.explanation.first_step} citations={citations} numbering={numbering} />
            </>
          )}
          <div className="mt-4 border-t border-line pt-3">
            <SourceList citations={citations} numbering={numbering} />
          </div>
        </PanelCard>
      )}

      <ResearchBlock
        projectId={projectId}
        target={{ kind: 'group', id: group.id }}
        subtitle={`Vše o vedoucím skupiny ${group.pi_name} — profil, publikace, granty a ocenění`}
      />

      <div className="flex flex-wrap gap-2 px-1 pt-1">
        <Button type="button" variant="outline" ariaLabel="Napsat vedoucímu skupiny" onClick={onEmail}>
          <EnvelopeSimpleIcon size={20} aria-hidden />
          Napsat vedoucímu skupiny
        </Button>
      </div>
    </div>
  )
}
