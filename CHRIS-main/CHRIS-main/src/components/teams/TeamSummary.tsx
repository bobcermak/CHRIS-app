import { byMatch } from '../../lib/data'
import type { Group, TeamVariant } from '../../lib/data'
import { Inset } from '../ui/Card'
import { CzechMap, type MapSeat } from './CzechMap'

type Node = Group['node']
const NODES: Node[] = ['Praha', 'Brno', 'Olomouc']

interface TeamSummaryProps {
  variant: TeamVariant
  groups: Record<string, Group>
  onOpen: (groupId: string) => void
}

/**
 * The team on a map of Czechia at the bottom of the team card — just the map. It takes whatever
 * height the card has left, so the team card always ends with the grant column.
 */
export function TeamSummary({ variant, groups, onOpen }: TeamSummaryProps) {
  const ranked = [...variant.members]
    .sort(byMatch)
    .map((member, i) => ({ member, group: groups[member.group_id], rank: i + 1 }))
    .filter((m) => m.group)
  if (!ranked.length) return null

  const byNode = Object.fromEntries(NODES.map((node) => [node, ranked.filter((m) => m.group.node === node)])) as Record<Node, MapSeat[]>

  return (
    <Inset className="flex flex-1 flex-col overflow-hidden p-4">
      {/* No height of its own on wide screens: the grant column sets the row height and the map
          takes exactly what is left. Stacked on narrow screens, where nothing aligns, 240 px. */}
      <CzechMap byNode={byNode} onOpen={onOpen} className="min-h-[240px] flex-1 lg:min-h-0" />
    </Inset>
  )
}
