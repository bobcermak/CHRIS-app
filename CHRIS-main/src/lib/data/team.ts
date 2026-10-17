import type { Citation, Gap, Group, MatchResult, Member, TeamVariant, TechResource } from './contract'

/**
 * Technologies of a team: the research infrastructures its groups use (`infrastructures` in the
 * NÚVR catalogue), most shared first. Each one lists the groups through which it is reachable
 * and cites their profiles — nothing beyond what the catalogue says.
 */
export function techFromGroups(variant: TeamVariant, groups: Record<string, Group>, citations: Record<string, Citation>): TechResource[] {
  const byName = new Map<string, Group[]>()
  for (const member of [...variant.members].sort(byMatch)) {
    const group = groups[member.group_id]
    for (const name of group?.infrastructures ?? []) byName.set(name, [...(byName.get(name) ?? []), group])
  }
  return [...byName.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 8)
    .map(([name, users]) => ({
      id: `infra-${name.toLocaleLowerCase('cs').replace(/[^a-z0-9]+/g, '-').slice(0, 60)}`,
      name,
      where: {
        group_id: users[0].id,
        institution: users.map((g) => g.pi_name).join(', '),
        node: [...new Set(users.map((g) => g.node))].join(', '),
      },
      access: `Infrastrukturu využívá ${users.length === 1 ? 'skupina' : `${users.length} skupiny`} z vašeho týmu. Přístup se domlouvá přes jejich vedoucí.`,
      citations: users.map((g) => citations[`nuvr-${g.slug}`]).filter(Boolean),
      group_ids: users.map((g) => g.id),
    }))
}

/**
 * Fallback: fill `tech` of every variant from its groups' infrastructures when the backend didn't
 * provide any. New `/match` responses already carry `technologies`; this keeps old cached matches
 * (and demo scenarios without `tech`) working.
 */
export function withTech(match: MatchResult): MatchResult {
  return {
    ...match,
    variants: match.variants.map((v) =>
      v.tech.length ? v : { ...v, tech: techFromGroups(v, match.groups, match.citations) },
    ),
  }
}

export interface AddMemberInput {
  group: Group
  /** 0..1 match with the project (catalogue search, shifted onto the team's `/match` scale). */
  score: number
  role: string
  /** How the group got in: picked by hand, or as the replacement for a removed group. */
  origin?: 'manual' | 'replacement'
  /** Who the user said is missing ("Popsat, koho hledám") — the role in their words. */
  description?: string
  /** `slot_key` of the gap this group fills; the gap disappears once it is added. */
  fills_gap?: string
  /** Why the group fits, from the backend (LLM); without it a generic sentence is used. */
  reason?: string
}

/** Members best match first — the order the team is shown and ranked in. */
export const byMatch = (a: Member, b: Member) => b.total - a.total

/**
 * Removes a group from one variant. Coverage (share of the backend's planned roles that are
 * filled) is left as the backend scored it — the role plan is not known here.
 */
export function withoutMember(match: MatchResult, variantId: string, groupId: string): MatchResult {
  return {
    ...match,
    variants: match.variants.map((v) => {
      if (v.id !== variantId) return v
      const members = v.members.filter((m) => m.group_id !== groupId)
      return { ...v, members }
    }),
  }
}

/**
 * Adds a hand-picked group to one variant. Every claim cites the group's NÚVR profile; coverage
 * (share of the backend's planned roles filled) is left as the backend scored it.
 */
export function withMember(
  match: MatchResult,
  variantId: string,
  { group, score, role, origin = 'manual', fills_gap, reason }: AddMemberInput,
): MatchResult {
  const citationId = `nuvr-${group.slug}`
  const citation: Citation = match.citations[citationId] ??
    group.dimensions.research?.citations[0] ?? {
      id: citationId,
      url: group.web_url ?? '',
      source: 'nuvr',
      title: `${group.lab_name} — profil výzkumné skupiny`,
      snippet: group.tags?.join(', ') || group.lab_name,
      fetched_at: new Date().toISOString(),
    }
  const cite = (text: string) => [{ text, citation_ids: [citation.id] }]
  const total = Math.max(0, Math.min(1, score))

  const member: Member = {
    group_id: group.id,
    role,
    covers: [role],
    scores: [{ dimension: 'research', score: total }],
    total,
    explanation: {
      why: cite(
        reason ||
          `${origin === 'replacement' ? 'Náhrada za vyměněnou skupinu' : 'Přidáno ručně'}. Shoda s projektem ${Math.round(total * 100)} % podle sémantického vyhledávání v katalogu NÚVR, převedená na stejnou škálu jako zbytek týmu.`,
      ),
      benefit: group.tags?.length ? cite(`${group.lab_name} přináší expertizu: ${group.tags.join(', ')}.`) : [],
      gap: [],
      first_step: cite(`Navázat kontakt s vedoucím skupiny ${group.pi_name}.`),
    },
    existing_collab_with: [],
    warnings: [],
  }

  return {
    ...match,
    groups: { ...match.groups, [group.id]: group },
    citations: { ...match.citations, [citation.id]: citation },
    variants: match.variants.map((v) => {
      if (v.id !== variantId || v.members.some((m) => m.group_id === group.id)) return v
      const members = [...v.members, member].sort(byMatch)
      return { ...v, members, gaps: fills_gap ? v.gaps.filter((g) => g.slot_key !== fills_gap) : v.gaps }
    }),
  }
}

/** Adds an unfilled role to one variant (e.g. the role of a group taken out of the team). */
export function withGap(match: MatchResult, variantId: string, gap: Gap): MatchResult {
  return {
    ...match,
    variants: match.variants.map((v) =>
      v.id !== variantId || v.gaps.some((g) => g.slot_key === gap.slot_key) ? v : { ...v, gaps: [...v.gaps, gap] },
    ),
  }
}

// Not a role: the backend's "LLM unavailable" note travels in `gaps` too.
const isRoleGap = (g: Gap) => g.slot_key !== 'llm'

/** Share of the team's roles that are filled: a member's `role` lists its roles joined by " + ". */
export function coverageOf(variant: TeamVariant): number {
  const filled = variant.members.reduce((n, m) => n + m.role.split(' + ').length, 0)
  const open = variant.gaps.filter(isRoleGap).length
  return filled + open ? filled / (filled + open) : 0
}

/**
 * After a manual edit the AI's team description no longer fits (it may name a group that left),
 * so it is replaced by a factual one built from the team as it is now.
 */
export function editedSummary(variant: TeamVariant, groups: Record<string, Group>): string {
  const people = [...variant.members]
    .sort(byMatch)
    .map((m) => `${groups[m.group_id]?.pi_name ?? m.group_id} (${m.role})`)
  const open = variant.gaps.filter(isRoleGap).map((g) => g.slot_key)
  const team = people.length ? `Tým po vašich úpravách: ${people.join(', ')}.` : 'V týmu po úpravách nezůstala žádná skupina.'
  return open.length ? `${team} Nepokryté role: ${open.join(', ')}.` : team
}

/** Summary and coverage of one variant brought in line with its current members and gaps. */
export function afterEdit(match: MatchResult, variantId: string): MatchResult {
  return {
    ...match,
    variants: match.variants.map((v) =>
      v.id !== variantId ? v : { ...v, summary: editedSummary(v, match.groups), coverage: coverageOf(v) },
    ),
  }
}
