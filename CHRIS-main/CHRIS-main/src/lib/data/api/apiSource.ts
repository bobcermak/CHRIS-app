import { API_URL } from '../../api/client'
import type { components } from '../../api/schema'
import { safeLocalStorage } from '../../storage'
import type {
  ApplicationDraft,
  ApplicationTemplate,
  BackendHealth,
  Citation,
  Claim,
  ClarifyAnswer,
  ClarifyQuestion,
  ClarifyRound,
  CopilotResult,
  CreateProjectInput,
  EmailTone,
  Gap,
  GrantCall,
  GrantInfo,
  GrantMatch,
  Group,
  IntentCard,
  MatchResult,
  Member,
  ResearchReport,
  ResearchTarget,
  Slot,
  StreamEvent,
  TeamDiff,
  TeamVariant,
  TechResource,
  TemplateLimits,
} from '../contract'
import { TEMPLATE_LIBRARY } from '../demo/templates'
import type { DataSource, StreamOp } from '../source'
import { afterEdit, byMatch, withGap, withMember, withoutMember, withTech } from '../team'

type BackendGroup = components['schemas']['Group']
type BackendMatch = components['schemas']['MatchResult']
type BackendMember = components['schemas']['TeamMember']
type BackendGrantMatch = components['schemas']['GrantMatch']
type BackendGap = components['schemas']['Gap']
type BackendTechnology = components['schemas']['Technology']
type GrantFirstResult = components['schemas']['GrantFirstResult']
type SearchHit = components['schemas']['SearchHit']
type GrantHit = components['schemas']['GrantHit']
// Fields with a backend default are optional in the request.
type MatchRequest = Pick<components['schemas']['MatchRequest'], 'query'> & Partial<components['schemas']['MatchRequest']>
type GrantFirstRequest = Pick<components['schemas']['GrantFirstRequest'], 'query'> & Partial<components['schemas']['GrantFirstRequest']>
type DraftRequest = components['schemas']['DraftRequest']
type DraftResponse = components['schemas']['DraftResponse']
type BackendTemplate = components['schemas']['ApplicationTemplate']
type BackendLimits = components['schemas']['TemplateLimits']
type CopilotRequest = components['schemas']['CopilotRequest']
type BackendCopilotResult = components['schemas']['CopilotResult']
type CopilotTurn = components['schemas']['CopilotTurn']
// Fields with a backend default are optional in the request.
type RefineRequest = Pick<components['schemas']['RefineRequest'], 'query' | 'members'> & Partial<components['schemas']['RefineRequest']>

/** POST /match inputs distilled by POST /clarify from the prompt + answers. */
interface BackendBrief {
  query: string
  /** Only when the researcher stated it; otherwise the AI decides the team size. */
  team_size: number | null
  nodes: string[]
  exclude_slugs: string[]
}

interface BackendClarify {
  round: number
  ready: boolean
  questions: ClarifyQuestion[]
  reason: string | null
  title: string
  summary: string
  slots: Slot[]
  readiness: number
  brief: BackendBrief
  warning?: string | null
}

/** What the API adapter keeps per project: the backend clarification is stateless, so the history lives here. */
interface ProjectRecord {
  intent: IntentCard
  context: Pick<CreateProjectInput, 'call' | 'own_group'>
  history: { questions: ClarifyQuestion[]; answers: ClarifyAnswer[] }[]
  /** Questions of the open round, waiting for answers. */
  pending: ClarifyQuestion[]
  brief: BackendBrief | null
}

const PROJECTS_KEY = 'chris:backend-projects:v2'
const LEGACY_PROJECTS_KEY = 'chris:backend-projects:v1'
const MATCHES_KEY = 'chris:backend-matches:v1'
const TEMPLATES_KEY = 'chris:backend-templates:v1'
const APPLICATIONS_KEY = 'chris:backend-applications:v1'
const VARIANTS_KEY = 'chris:backend-variants:v1'
/** Copilot chat per application: the backend is stateless, the conversation lives here. */
const COPILOT_KEY = 'chris:backend-copilot:v1'

function readRecord<T>(key: string): Record<string, T> {
  const raw = safeLocalStorage.getItem(key) as string | null
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, T>
  } catch {
    return {}
  }
}

function writeRecord<T>(key: string, value: Record<string, T>) {
  safeLocalStorage.setItem(key, JSON.stringify(value))
}

function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

function streamResult<T>(build: (signal: AbortSignal) => Promise<T>, stages: string[] = ['backend']): StreamOp<T> {
  return async function* (signal): AsyncIterable<StreamEvent> {
    for (const stage of stages) yield { type: 'thinking', stage }
    try {
      const result = await build(signal)
      if (!signal.aborted) yield { type: 'result', data: result }
    } catch (error) {
      if (!signal.aborted) {
        yield {
          type: 'error',
          message: error instanceof Error ? error.message : 'Backend neodpověděl.',
          recoverable: true,
        }
      }
    }
  }
}

function backendUrl(path: string) {
  return new URL(path, API_URL).toString()
}

async function postJson<T>(path: string, body: unknown, signal: AbortSignal): Promise<T> {
  const response = await fetch(backendUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!response.ok) throw new Error(`Backend vrátil HTTP ${response.status}.`)
  return (await response.json()) as T
}

/** POST returning a file (e.g. a PDF) as a Blob. */
async function postBlob(path: string, body: unknown, signal: AbortSignal): Promise<Blob> {
  const response = await fetch(backendUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!response.ok) throw new Error(`Export se nepodařil (HTTP ${response.status}).`)
  return response.blob()
}

/** Multipart POST; a 422 carries a reason written for the user (e.g. "Dokument je větší než 15 MB."). */
async function postForm<T>(path: string, body: FormData, signal: AbortSignal): Promise<T> {
  const response = await fetch(backendUrl(path), { method: 'POST', body, signal })
  if (response.status === 422) {
    const detail = ((await response.json().catch(() => null)) as { detail?: unknown } | null)?.detail
    throw new Error(typeof detail === 'string' ? detail : 'Backend požadavek odmítl.')
  }
  if (!response.ok) throw new Error(`Backend vrátil HTTP ${response.status}.`)
  return (await response.json()) as T
}

async function getJson<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const url = new URL(path, API_URL)
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') url.searchParams.set(key, String(value))
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (response.status === 404) throw new Error('Záznam nebyl nalezen.')
  if (!response.ok) throw new Error(`Backend vrátil HTTP ${response.status}.`)
  return (await response.json()) as T
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

function toCitation(group: BackendGroup): Citation {
  return {
    id: `nuvr-${group.slug}`,
    url: group.url,
    source: 'nuvr',
    title: `${group.name} — profil výzkumné skupiny`,
    snippet: group.focus || (group.expertise ?? []).join(', ') || group.name,
    fetched_at: new Date().toISOString(),
  }
}

function toGroup(group: BackendGroup): Group {
  const citation = toCitation(group)
  const researchItems = [...(group.expertise ?? []), group.focus].filter(Boolean)
  return {
    id: group.slug,
    slug: group.slug,
    lab_name: group.name,
    pi_name: group.pi,
    node: group.node === 'Brno' || group.node === 'Olomouc' ? group.node : 'Praha',
    institution: (group.faculties ?? []).join(', ') || 'NÚVR',
    programs: group.programs ?? [],
    web_url: group.url,
    email: group.email || undefined,
    photo_url: group.photo_url || undefined,
    tags: group.expertise ?? [],
    dimensions: {
      research: { items: researchItems, citations: [citation] },
      output: { items: group.publications ?? [], citations: [citation] },
    },
    collaborations: group.collaborations ?? [],
    infrastructures: group.infrastructures ?? [],
    freshness: 'verified',
    modified_at: new Date().toISOString(),
  }
}

function claim(text: string, citationId: string) {
  return text ? [{ text, citation_ids: [citationId] }] : []
}

function toMember(member: BackendMember, group: Group): Member {
  const citationId = `nuvr-${member.group.slug}`
  const total = clamp01(member.score)
  const reason = member.reason || 'Skupina byla nalezena podle podobnosti výzkumného záměru.'
  // One group can fill more than one role.
  const roles = [member.role, ...(member.also_covers ?? [])]
  return {
    group_id: group.id,
    role: roles.map((r) => r.name).join(' + '),
    covers: roles.map((r) => r.description),
    scores: [{ dimension: 'research', score: total }],
    total,
    explanation: {
      why: claim(reason, citationId),
      benefit: claim(`${group.lab_name} přináší expertizu: ${group.tags?.join(', ') || group.lab_name}.`, citationId),
      gap: [],
      first_step: claim(`Navázat kontakt s vedoucím skupiny ${group.pi_name}.`, citationId),
    },
    existing_collab_with: [],
    warnings: [],
  }
}

function toAgency(agency: string): GrantCall['agency'] {
  if (/AZV/i.test(agency)) return 'AZV'
  if (/GA ČR|GACR/i.test(agency)) return 'GACR'
  if (/TA ČR|TACR/i.test(agency)) return 'TACR'
  if (/Horizon/i.test(agency)) return 'HORIZON'
  return 'OTHER'
}

/**
 * Template from the library for a backend grant (by provider and scheme), so the application step
 * can recommend it. Calls without a matching template (ERC, MSCA, EIC, …) get none.
 */
function templateFor(slug: string): string | undefined {
  if (slug.startsWith('azv-')) return 'azv-standard'
  if (slug.startsWith('gacr-')) return 'gacr-standard'
  if (slug.startsWith('tacr-')) return 'tacr-sigma'
  if (slug.startsWith('horizon-')) return 'horizon-ria-ia'
  return undefined
}

/** Grants stored before templates were mapped get their template on read. */
function withTemplates(match: MatchResult): MatchResult {
  return {
    ...match,
    variants: match.variants.map((v) => ({
      ...v,
      grants: v.grants.map((g) => (g.call.template_id ? g : { ...g, call: { ...g.call, template_id: templateFor(g.call.id) } })),
    })),
  }
}

function toGrantMatch({ grant, score }: BackendGrantMatch): GrantMatch {
  const closed = grant.deadline ? new Date(grant.deadline).getTime() < Date.now() : false
  return {
    call: {
      id: grant.slug,
      agency: toAgency(grant.agency),
      provider: grant.agency,
      // The title already names the scheme ("TA ČR SIGMA — …"); prefixing the programme doubled it.
      name: grant.title,
      deadline: grant.deadline || undefined,
      status: closed ? 'closed' : 'open',
      rules_id: grant.slug,
      template_id: templateFor(grant.slug),
      url: grant.url || '',
    },
    fit: clamp01(score),
    // Backend does not check eligibility yet; no check without a source.
    checks: [],
  }
}

/** A backend team (from `/match` or one grant-first option) with its role plan and unfilled roles. */
interface BackendTeam {
  team: BackendMember[]
  role_plan: BackendMatch['role_plan']
  gaps?: BackendGap[]
  team_rationale?: string
  team_summary?: string
  technologies?: BackendTechnology[]
}

/** LLM-proposed technology → UI `TechResource`. Providers in the team become `group_ids`. */
function toTechResource(tech: BackendTechnology, shared: Pick<MatchResult, 'groups' | 'citations'>): TechResource {
  const slug = tech.name.toLocaleLowerCase('cs').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
  const providers = tech.providers ?? []
  const first = providers[0]
  const inTeam = providers.filter((p) => shared.groups[p.group_slug])
  const access = providers.length
    ? `Umí ${providers.length === 1 ? 'skupina' : `${providers.length} skupiny`} z vašeho týmu. Přístup se domlouvá přes jejich vedoucí.`
    : tech.description || 'Technologie navržená AI podle zadání projektu.'
  return {
    id: `tech-${slug || 'metoda'}`,
    name: tech.name,
    description: tech.description || undefined,
    where: {
      group_id: first?.group_slug,
      institution: first ? first.group_name : 'NÚVR',
      node: first?.node || '',
      infrastructure: tech.infrastructures?.[0],
    },
    access,
    citations: inTeam.map((p) => shared.citations[`nuvr-${p.group_slug}`]).filter(Boolean) as TechResource['citations'],
    group_ids: inTeam.map((p) => p.group_slug),
  }
}

/** One team variant from a backend team; groups and citations are collected into the shared maps. */
function toVariant(
  id: string,
  strategy: TeamVariant['strategy'],
  fallbackSummary: string,
  backend: BackendTeam,
  grants: GrantMatch[],
  warning: string | null | undefined,
  into: Pick<MatchResult, 'groups' | 'citations'>,
): TeamVariant {
  for (const member of backend.team) {
    into.groups[member.group.slug] = toGroup(member.group)
    into.citations[`nuvr-${member.group.slug}`] = toCitation(member.group)
  }
  // The backend lists the team in role order; the UI ranks by match.
  const members = backend.team.map((member) => toMember(member, into.groups[member.group.slug])).sort(byMatch)
  // Unfilled roles: must-haves first. The team size is the AI's call, so coverage = share of planned roles filled.
  const gaps: Gap[] = [...(backend.gaps ?? [])]
    .sort((a, b) => Number(a.role.priority === 'nice') - Number(b.role.priority === 'nice'))
    .map((gap) => ({
      slot_key: gap.role.name,
      label: `${gap.role.name}${gap.role.priority === 'nice' ? ' (volitelné)' : ''} — ${gap.reason}`,
    }))
  const planned = backend.role_plan.length
  const coverage = planned ? Math.max(0, planned - gaps.length) / planned : 0
  return {
    id,
    strategy,
    // The summary of the picked team; the rationale (written before groups are picked) only as a fallback.
    summary: warning
      ? 'Doporučení z vektorového vyhledávání.'
      : backend.team_summary || backend.team_rationale || fallbackSummary,
    members,
    coverage,
    gaps: warning ? [{ slot_key: 'llm', label: warning }, ...gaps] : gaps,
    tech: (backend.technologies ?? []).map((t) => toTechResource(t, into)),
    grants,
    weights:
      strategy === 'GRANT'
        ? { coverage: 0.5, complementarity: 0, grant: 0.5, existing_collab: 0, new_link: 0 }
        : { coverage: 1, complementarity: 0, grant: 0, existing_collab: 0, new_link: 0 },
  }
}

/**
 * Both strategies run in parallel: `/match` (Intelligence-first) and `/match/grant-first`
 * (the team for the best-fitting call). One failing still shows the other.
 */
function toMatchResult(intent: IntentCard, intelligence: BackendMatch | null, grantFirst: GrantFirstResult | null): MatchResult {
  const shared: Pick<MatchResult, 'groups' | 'citations'> = { groups: {}, citations: {} }
  const variants: TeamVariant[] = []
  if (intelligence) {
    variants.push(
      toVariant(
        `${intent.id}-intelligence`,
        'INTELLIGENCE',
        'Tým sestavený podle výzkumné relevance.',
        intelligence,
        (intelligence.grants ?? []).map(toGrantMatch),
        intelligence.warning,
        shared,
      ),
    )
  }
  const [top] = grantFirst?.grant_options ?? []
  if (grantFirst && top) {
    variants.push(
      toVariant(
        `${intent.id}-grant`,
        'GRANT',
        `Tým sestavený pro výzvu ${top.grant.title}.`,
        top,
        grantFirst.grant_options.map((option) => toGrantMatch({ grant: option.grant, score: option.grant_score })),
        grantFirst.warning,
        shared,
      ),
    )
  }
  // Variants already carry `tech` from the backend (toVariant). `withTech` on reads kicks in only
  // if a variant comes back with an empty `tech` (old cache or demo).
  return { intent, variants, ...shared }
}

const toScoredGroup = (hit: SearchHit) => ({ score: clamp01(hit.score), item: toGroup(hit.group) })
const toScoredGrant = (hit: GrantHit) => ({ score: clamp01(hit.score), item: hit.grant })

const DRAFT_TONE: Record<EmailTone, Pick<DraftRequest, 'tone' | 'instruction'>> = {
  default: { tone: 'neutral' },
  formal: { tone: 'formal' },
  short: { tone: 'neutral', instruction: 'Napiš to stručně, nejvýše pět vět.' },
}

// Mirror of backend `DeepSearchResult` — move to generated schema after `pnpm gen:api`.
interface DeepSearchCitation {
  url: string
  title: string
}
interface DeepSearchResult {
  entity_type: 'group' | 'grant' | 'technology'
  ref: string
  summary: string
  citations: DeepSearchCitation[]
  generated_at: string
  warning: string | null
}

function toDeepCitation(c: DeepSearchCitation, id: string, fetchedAt: string): Citation {
  return {
    id,
    url: c.url,
    source: 'user',
    title: c.title || c.url,
    snippet: c.title || c.url,
    fetched_at: fetchedAt,
  }
}

const SECTION_KEY: Record<ResearchTarget['kind'], ResearchReport['sections'][number]['key']> = {
  group: 'state',
  grant: 'competition',
  tech: 'alternatives',
}

const SECTION_TITLE: Record<ResearchTarget['kind'], string> = {
  group: 'Hloubkový průzkum skupiny',
  grant: 'Hloubkový průzkum grantu',
  tech: 'Hloubkový průzkum technologie',
}

/** Split the Perplexity markdown summary into paragraph claims and route `[N](url)` into citation ids. */
function toResearchReport(target: ResearchTarget, backend: DeepSearchResult): ResearchReport {
  const citations: Record<string, Citation> = {}
  const citationIds: string[] = backend.citations.map((c, i) => {
    const id = `deep-${target.kind}-${target.id}-${i + 1}`
    citations[id] = toDeepCitation(c, id, backend.generated_at)
    return id
  })

  // Perplexity uses several citation styles: [web:12], [source:3], [12](url), [12]. All map to
  // 1-based positions in `backend.citations`. Capture them in one pass so adjacent markers (eg.
  // `[web:23][web:1][web:40]`) all attach without the leftover from the previous one lingering.
  const CITE_RE = /\[(?:web|source):(\d+)\]|\[(\d+)\](?:\([^)]*\))?/gi

  // Perplexity sometimes answers with a markdown table; without preprocessing those pipes end up
  // in the rendered text. Drop the `|---|---|` separator rows and turn each `| a | b |` row into
  // its own paragraph (cells joined by `·`) so the paragraph splitter below can treat them.
  const summary = backend.summary
    .replace(/^[ \t]*\|?[ \t]*(?::?-{2,}:?[ \t]*\|)+[ \t]*:?-{2,}:?[ \t]*\|?[ \t]*$\n?/gm, '')
    .replace(/^[ \t]*\|(.+)\|[ \t]*$/gm, (_, inner: string) => {
      const cells = inner.split('|').map((c) => c.trim()).filter(Boolean)
      return cells.length > 1 ? `\n${cells.join(' · ')}\n` : cells[0] ?? ''
    })

  const paragraphs = summary.split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean)
  const claims: Claim[] = paragraphs
    .map((para): Claim => {
      const used = new Set<string>()
      const text = para
        .replace(CITE_RE, (_, a?: string, b?: string) => {
          const id = citationIds[Number(a ?? b) - 1]
          if (id) used.add(id)
          return ''
        })
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^\s*[-*]\s+/gm, '• ')
        .replace(/[ \t]+/g, ' ')
        .replace(/ +([.,;:!?])/g, '$1')
        .trim()
      return { text, citation_ids: [...used] }
    })
    // No claim without a source — drop paragraphs Perplexity returned uncited.
    .filter((c) => c.text && c.citation_ids.length > 0)

  return {
    target,
    sections: [{ key: SECTION_KEY[target.kind], title: SECTION_TITLE[target.kind], claims }],
    citations,
  }
}

function deepSearchBody(target: ResearchTarget, projectId: string): { path: string; body: unknown } {
  if (target.kind === 'group') return { path: '/deep-search/group', body: { slug: target.id } }
  if (target.kind === 'grant') return { path: '/deep-search/grant', body: { slug: target.id } }
  // Technologies are derived from the team on read (see `getMatch`), not stored — apply the same
  // transform here or `v.tech` is empty and the lookup always misses.
  const raw = readRecord<MatchResult>(MATCHES_KEY)[projectId]
  const match = raw ? withTech(raw) : null
  const tech = match?.variants.flatMap((v) => v.tech).find((t) => t.id === target.id)
  if (!tech) throw new Error('Technologii se nepodařilo najít v projektu.')
  const where = [tech.where.institution, tech.where.infrastructure].filter(Boolean).join(', ')
  const description = [where, tech.access].filter(Boolean).join('. ') || tech.name
  return { path: '/deep-search/technology', body: { name: tech.name, description } }
}

/** Backend limits list every field (null = not stated); the UI wants only the stated ones. */
function toLimits(limits: BackendLimits | null | undefined): TemplateLimits | undefined {
  const stated = Object.fromEntries(Object.entries(limits ?? {}).filter(([, v]) => v != null))
  return Object.keys(stated).length ? (stated as TemplateLimits) : undefined
}

function toTemplate(t: BackendTemplate): ApplicationTemplate {
  return {
    id: t.id,
    status: t.status,
    agency: t.agency ?? 'OTHER',
    scheme: t.scheme,
    version: t.version ?? '—',
    language: t.language ?? 'cs',
    based_on: t.based_on ?? undefined,
    diff: t.diff ?? undefined,
    sections: t.sections.map((s) => ({
      key: s.key,
      title: s.title,
      required: s.required ?? true,
      hint: s.hint ?? '',
      limits: toLimits(s.limits),
      confirmed: s.confirmed ?? false,
      citation_ids: s.citation_ids ?? [],
    })),
    document_limits: toLimits(t.document_limits),
    rules_id: t.rules_id ?? undefined,
    source_url: t.source_url ?? '',
    fetched_at: t.fetched_at,
    unknown: t.unknown ?? [],
    citations: t.citations ?? [],
    warning: t.warning ?? undefined,
  }
}

function toCopilotResult(r: BackendCopilotResult): CopilotResult {
  return {
    comments: (r.comments ?? []).map((c) => ({
      id: c.id,
      section_key: c.section_key ?? '',
      mode: c.mode,
      severity: c.severity,
      text: c.text,
      criterion: c.criterion ?? undefined,
      quote: c.quote ?? undefined,
      suggested_edit: c.suggested_edit ?? undefined,
    })),
    score: r.score ? { total: r.score.total, criteria: r.score.criteria, general_criteria: r.score.general_criteria ?? false } : undefined,
    section_patch: r.section_patch ?? undefined,
    reply: r.reply ?? undefined,
  }
}

function findTemplate(id: string): ApplicationTemplate {
  const template = readRecord<ApplicationTemplate>(TEMPLATES_KEY)[id] ?? TEMPLATE_LIBRARY.find((t) => t.id === id)
  if (!template) throw new Error('Šablona nebyla nalezena.')
  return template
}

/** "Řešitelský tým" prefilled from the chosen variant: leader, workplace and role — facts only. */
function teamSection(variant: TeamVariant, groups: Record<string, Group>) {
  return [...variant.members]
    .sort(byMatch)
    .map((m) => {
      const g = groups[m.group_id]
      return g ? `- **${g.pi_name}** (${g.institution}) — ${m.role}` : null
    })
    .filter(Boolean)
    .join('\n')
}

/** First sentence of the prompt, cut at a word boundary (never mid-word) to ~90 characters. */
function projectTitle(prompt: string) {
  const sentence = prompt.split(/[.!?]/, 1)[0].trim()
  if (sentence.length <= 90) return sentence || 'Nový výzkumný projekt'
  return `${sentence.slice(0, 90).replace(/\s+\S*$/, '')}…`
}

function readProject(id: string): ProjectRecord {
  const record = readRecord<ProjectRecord>(PROJECTS_KEY)[id]
  if (record) return record
  // Projects saved before clarification existed (v1 stored just the intent) keep working:
  // upgraded once, with no answered rounds and no brief (match then uses the prompt).
  const legacy = readRecord<IntentCard>(LEGACY_PROJECTS_KEY)[id]
  if (!legacy) throw new Error('Projekt nebyl nalezen.')
  const upgraded: ProjectRecord = { intent: legacy, context: { call: null, own_group: null }, history: [], pending: [], brief: null }
  writeProject(id, upgraded)
  return upgraded
}

function writeProject(id: string, record: ProjectRecord) {
  const projects = readRecord<ProjectRecord>(PROJECTS_KEY)
  projects[id] = record
  writeRecord(PROJECTS_KEY, projects)
}

/**
 * What edits search with: the project description and exclusions distilled by clarification
 * (same as `/match` got), or the raw prompt for projects without it.
 */
function searchContext(projectId: string): { query: string; exclude_slugs: string[]; nodes: string[] } {
  const { intent, brief } = readProject(projectId)
  return {
    query: brief?.query || intent.prompt,
    exclude_slugs: brief?.exclude_slugs ?? [],
    nodes: brief?.nodes ?? [],
  }
}

/** `/match/refine` needs a role description of at least 10 characters; `context` pads a short one. */
function roleText(text: string, context: string): string {
  const t = text.trim()
  return t.length >= 10 ? t : `${t || 'Doplněný člen'}: ${context}`
}

/**
 * `/match/refine` for one group in one role: the LLM's reason and the match scored against that
 * role (same scale as `/match`). Undefined if it fails — callers keep what they have.
 */
async function refineOne(query: string, role: string, description: string, slug: string, signal: AbortSignal) {
  try {
    const refined = await postJson<BackendMatch>(
      '/match/refine',
      {
        query,
        members: [{ role_name: role, role_description: description, group_slug: slug }],
        grants_top_k: 0,
        tech_top_k: 0,
      } satisfies RefineRequest,
      signal,
    )
    return refined.team[0]
  } catch {
    return undefined
  }
}

/** Word overlap of two role names (crude, diacritics-insensitive) — to match a role to a role. */
function overlap(a: string, b: string): number {
  const words = (s: string) =>
    new Set(
      s
        .toLocaleLowerCase('cs')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 3)
        .map((w) => w.slice(0, 6)),
    )
  const x = words(a)
  const y = words(b)
  const common = [...x].filter((w) => y.has(w)).length
  return x.size && y.size ? common / Math.min(x.size, y.size) : 0
}

function saveMatch(projectId: string, match: MatchResult) {
  writeRecord(MATCHES_KEY, { ...readRecord<MatchResult>(MATCHES_KEY), [projectId]: match })
}

/** One POST /clarify round; `history` already contains every answered round. */
async function clarifyRound(id: string, record: ProjectRecord, finish: boolean, signal: AbortSignal): Promise<ClarifyRound> {
  const res = await postJson<BackendClarify>(
    '/clarify',
    { prompt: record.intent.prompt, context: record.context, history: record.history, finish },
    signal,
  )
  const intent: IntentCard = {
    ...record.intent,
    title: res.title || record.intent.title,
    summary: res.summary || record.intent.summary,
    slots: res.slots,
    readiness: res.readiness,
    search: { query: res.brief.query, exclude_slugs: res.brief.exclude_slugs, nodes: res.brief.nodes },
  }
  writeProject(id, { ...record, intent, pending: res.questions, brief: res.brief })
  return { intent, questions: res.questions, round: res.round, ready: res.ready, reason: res.reason ?? undefined }
}

export const apiSource: DataSource = {
  kind: 'api',

  async createProject(input: CreateProjectInput) {
    const intent: IntentCard = {
      id: uid('project'),
      prompt: input.prompt,
      title: projectTitle(input.prompt),
      summary: input.prompt,
      slots: [],
      readiness: 0,
    }
    writeProject(intent.id, {
      intent,
      context: { call: input.call, own_group: input.own_group },
      history: [],
      pending: [],
      brief: null,
    })
    return intent
  },

  async getProject(id) {
    return readProject(id).intent
  },

  async deleteProject(id) {
    const projects = readRecord<ProjectRecord>(PROJECTS_KEY)
    const legacy = readRecord<IntentCard>(LEGACY_PROJECTS_KEY)
    const matches = readRecord<MatchResult>(MATCHES_KEY)
    delete projects[id]
    // Also from the pre-v2 store, or the upgrade in readProject would bring it back.
    delete legacy[id]
    delete matches[id]
    writeRecord(PROJECTS_KEY, projects)
    writeRecord(LEGACY_PROJECTS_KEY, legacy)
    writeRecord(MATCHES_KEY, matches)
  },

  // A fresh start ("Upřesnit znovu") forgets earlier answers.
  clarify: (id) =>
    streamResult(
      (signal) => clarifyRound(id, { ...readProject(id), history: [], pending: [] }, false, signal),
      ['decompose', 'clarify'],
    ),

  answer: (id, answers, finish) =>
    streamResult(async (signal) => {
      const record = readProject(id)
      const history = record.pending.length ? [...record.history, { questions: record.pending, answers }] : record.history
      return clarifyRound(id, { ...record, history, pending: [] }, finish, signal)
    }, ['clarify']),

  match: (id) => streamResult(async (signal) => {
    const { intent, brief } = readProject(id)
    // No team_size unless the researcher gave one — the AI decides how many groups the project needs.
    const body: MatchRequest = brief
      ? { query: brief.query, team_size: brief.team_size, nodes: brief.nodes, exclude_slugs: brief.exclude_slugs }
      : { query: intent.prompt }
    const grantBody: GrantFirstRequest = { query: body.query, top_grants: 3, team_size: body.team_size }
    // Both strategies in parallel; one failing still shows the other.
    const [intelligence, grantFirst] = await Promise.allSettled([
      postJson<BackendMatch>('/match', body, signal),
      postJson<GrantFirstResult>('/match/grant-first', grantBody, signal),
    ])
    if (intelligence.status === 'rejected' && grantFirst.status === 'rejected') throw intelligence.reason
    const result = toMatchResult(
      intent,
      intelligence.status === 'fulfilled' ? intelligence.value : null,
      grantFirst.status === 'fulfilled' ? grantFirst.value : null,
    )
    const matches = readRecord<MatchResult>(MATCHES_KEY)
    matches[id] = result
    writeRecord(MATCHES_KEY, matches)
    return result
  }, ['retrieval', 'compose']),

  async getMatch(id) {
    const match = readRecord<MatchResult>(MATCHES_KEY)[id]
    // Teams stored before technologies / template mapping existed get them on read.
    return match ? withTemplates(withTech(match)) : null
  },

  /**
   * A group picked by hand. `/match/refine` explains it in the role the user asked for (LLM
   * reason, match scored against that role like the rest of the team); if that fails the group
   * is still added, with a generic reason.
   */
  async addMember(projectId, variantId, input) {
    const match = readRecord<MatchResult>(MATCHES_KEY)[projectId]
    if (!match) throw new Error('Tým ještě není sestavený.')
    const { query } = searchContext(projectId)
    let { score, reason } = input
    const explained = await refineOne(query, input.role, roleText(input.description || input.role, input.group.tags?.slice(0, 3).join(', ') || input.group.lab_name), input.group.slug, AbortSignal.timeout(60_000))
    if (explained) {
      score = clamp01(explained.score)
      reason = explained.reason || reason
    }
    const next = withTech(afterEdit(withMember(match, variantId, { ...input, score, reason }), variantId))
    saveMatch(projectId, next)
    return next
  },
  async restoreVariant(projectId, variant) {
    const matches = readRecord<MatchResult>(MATCHES_KEY)
    const match = matches[projectId]
    if (!match) throw new Error('Tým nebyl nalezen.')
    const next = withTech({ ...match, variants: match.variants.map((v) => (v.strategy === variant.strategy ? variant : v)) })
    writeRecord(MATCHES_KEY, { ...matches, [projectId]: next })
    return next
  },
  /**
   * Remove / replace, one action at a time:
   * - remove: the group leaves; its role becomes a gap.
   * - replace: `/match` picks the replacement — the project description plus the role to fill,
   *   with the current team and the researcher's own group excluded — so the LLM chooses among
   *   the best candidates exactly as when the team was composed. Nobody fitting → a gap.
   * The team description is then rewritten for the team as it is now.
   */
  recompute: (projectId, req) =>
    streamResult(async (signal) => {
      const match = readRecord<MatchResult>(MATCHES_KEY)[projectId]
      const before = match?.variants.find((v) => v.id === req.variant_id)
      if (!match || !before) throw new Error('Tým nebyl nalezen.')
      const { query, exclude_slugs, nodes } = searchContext(projectId)

      let next = match
      for (const action of req.actions) {
        if (action.action === 'keep') continue
        const current = next.variants.find((v) => v.id === before.id)!
        const member = current.members.find((m) => m.group_id === action.group_id)
        if (!member) continue
        const leaving = next.groups[member.group_id]
        next = withoutMember(next, before.id, member.group_id)

        if (action.action === 'remove') {
          next = withGap(next, before.id, { slot_key: member.role, label: `${member.role} — skupina ${leaving?.pi_name ?? member.group_id} byla z týmu odebrána.` })
          continue
        }

        const inTeam = current.members.map((m) => m.group_id)
        const roleDescription = roleText(member.covers.join(' '), member.role)
        const body: MatchRequest = {
          // The role first, the project as context — the planner then centres on this one role.
          query: `Hledáme jednu skupinu do role: ${member.role} — ${roleDescription}\n\nKontext projektu: ${query}`,
          team_size: 2,
          exclude_slugs: [...exclude_slugs, ...inTeam],
          nodes,
          grants_top_k: 0,
          tech_top_k: 0,
        }
        const found = await postJson<BackendMatch>('/match', body, signal)
        // `/match` plans at least two roles; take the group whose role is closest to the one replaced.
        const pick = [...found.team].sort((a, b) => overlap(b.role.name, member.role) - overlap(a.role.name, member.role))[0]
        if (!pick) {
          const why = found.gaps?.[0]?.reason || 'V katalogu NÚVR jsem pro tuto roli nenašel jinou vhodnou skupinu.'
          next = withGap(next, before.id, { slot_key: member.role, label: `${member.role} — ${why}` })
          continue
        }
        const group = toGroup(pick.group)
        // Explained and scored in exactly the role it takes over (the pick's own role may differ a bit).
        const explained = await refineOne(query, member.role, roleDescription, group.slug, signal)
        next = withMember(next, before.id, {
          group,
          role: member.role,
          score: clamp01(explained?.score ?? pick.score),
          reason: explained?.reason || pick.reason,
          origin: 'replacement',
        })
      }

      next = afterEdit(next, before.id)
      const after = { ...next.variants.find((v) => v.id === before.id)!, id: uid(before.strategy.toLowerCase()) }
      const result = withTech({ ...next, variants: next.variants.map((v) => (v.id === before.id ? after : v)) })
      const afterVariant = result.variants.find((v) => v.id === after.id)!
      // Keep the previous variant so "Vrátit změnu" can bring it back.
      writeRecord(VARIANTS_KEY, { ...readRecord<TeamVariant>(VARIANTS_KEY), [before.id]: before })
      saveMatch(projectId, result)

      const was = new Set(before.members.map((m) => m.group_id))
      const now = new Set(afterVariant.members.map((m) => m.group_id))
      const gapKeys = new Set(before.gaps.map((g) => g.slot_key))
      return {
        before,
        after: afterVariant,
        added: [...now].filter((id) => !was.has(id)),
        removed: [...was].filter((id) => !now.has(id)),
        kept: [...now].filter((id) => was.has(id)),
        coverage_delta: afterVariant.coverage - before.coverage,
        new_gaps: afterVariant.gaps.filter((g) => !gapKeys.has(g.slot_key)),
        closed_gaps: before.gaps.filter((g) => !afterVariant.gaps.some((x) => x.slot_key === g.slot_key)),
        groups: result.groups,
      } satisfies TeamDiff
    }, ['retrieval', 'compose']),
  async revertVariant(projectId, variantId) {
    const matches = readRecord<MatchResult>(MATCHES_KEY)
    const match = matches[projectId]
    const previous = readRecord<TeamVariant>(VARIANTS_KEY)[variantId]
    if (!match || !previous) throw new Error('Předchozí tým se nepodařilo obnovit.')
    const restored = withTech({ ...match, variants: match.variants.map((v) => (v.strategy === previous.strategy ? previous : v)) })
    writeRecord(MATCHES_KEY, { ...matches, [projectId]: restored })
    return restored
  },
  research: (projectId, target) =>
    async function* (signal): AsyncIterable<StreamEvent> {
      yield { type: 'thinking', stage: 'research', verb: 'Prohledávám literaturu…' }
      try {
        const { path, body } = deepSearchBody(target, projectId)
        // Perplexity calls can take up to ~180 s per backend contract.
        const combined = AbortSignal.any([signal, AbortSignal.timeout(185_000)])
        const result = await postJson<DeepSearchResult>(path, body, combined)
        if (signal.aborted) return
        if (result.warning) {
          yield { type: 'warning', warning: { code: 'deep_search_partial', severity: 'warn', text: result.warning } }
        }
        yield { type: 'result', data: toResearchReport(target, result) }
      } catch (error) {
        if (signal.aborted) return
        yield {
          type: 'error',
          message: error instanceof Error ? error.message : 'Backend neodpověděl.',
          recoverable: true,
        }
      }
    },
  async emailDraft(projectId, groupId, tone) {
    const intent = await apiSource.getProject(projectId)
    const match = readRecord<MatchResult>(MATCHES_KEY)[projectId]
    const member = match?.variants.flatMap((v) => v.members).find((m) => m.group_id === groupId)
    const body: DraftRequest = {
      query: intent.prompt,
      targets: [{ group: groupId, reason: member?.explanation.why[0]?.text ?? '' }],
      language: 'cs',
      ...DRAFT_TONE[tone],
    }
    const response = await postJson<DraftResponse>('/drafts', body, AbortSignal.timeout(60_000))
    const draft = response.drafts[0]
    if (!draft) throw new Error(response.errors?.[0]?.detail ?? 'Backend nevrátil návrh e-mailu.')
    return { to: draft.recipient_email ?? '', subject: draft.subject, body: draft.body, language: 'cs', group_id: draft.group_slug }
  },
  async groups(filter = {}) {
    const list = await getJson<BackendGroup[]>('/groups', { node: filter.node, program: filter.program })
    return list.map(toGroup)
  },
  async searchGroups(q, topK = 12) {
    return (await getJson<SearchHit[]>('/groups/search', { q, top_k: topK })).map(toScoredGroup)
  },
  async getGroup(slug) {
    return toGroup(await getJson<BackendGroup>(`/groups/${encodeURIComponent(slug)}`))
  },
  grants: (agency) => getJson<GrantInfo[]>('/grants', { agency }),
  async searchGrants(q, topK = 12) {
    return (await getJson<GrantHit[]>('/grants/search', { q, top_k: topK })).map(toScoredGrant)
  },
  getGrant: (slug) => getJson<GrantInfo>(`/grants/${encodeURIComponent(slug)}`),
  health: () => getJson<BackendHealth>('/health'),

  // The template library is static data (sections and limits of each call), not a backend
  // feature, so it works the same against the real backend; edits are kept locally.
  async templates() {
    const edited = readRecord<ApplicationTemplate>(TEMPLATES_KEY)
    return TEMPLATE_LIBRARY.map((t) => edited[t.id] ?? t)
  },
  async getTemplate(id) {
    return findTemplate(id)
  },
  /**
   * POST /templates/resolve: the backend reads the call documentation (page + linked documents,
   * or an uploaded PDF/DOCX) and extracts the outline with a citation per section (§9.5). It falls
   * back to the generic outline itself; the result is kept locally like the user's confirmations.
   */
  resolveTemplate: (input) =>
    streamResult(
      async (signal) => {
        // The call is known by id, or by its page when the link was pre-filled from a team's grant.
        const url = 'url' in input ? input.url : undefined
        const call = Object.values(readRecord<MatchResult>(MATCHES_KEY))
          .flatMap((m) => m.variants.flatMap((v) => v.grants))
          .find((g) => (input.call_id ? g.call.id === input.call_id : Boolean(url) && g.call.url === url))?.call
        const form = new FormData()
        if ('file' in input) form.append('file', input.file)
        else {
          const docs = url ?? call?.url
          if (!docs) throw new Error('K této výzvě nemám odkaz na dokumentaci. Vložte ho nebo nahrajte PDF.')
          form.append('url', docs)
        }
        const grant = input.call_id ?? call?.id
        if (grant) form.append('grant', grant)
        // Scraping linked documents and the extraction take a while; give it up to 3 minutes.
        const template = toTemplate(
          await postForm<BackendTemplate>('/templates/resolve', form, AbortSignal.any([signal, AbortSignal.timeout(180_000)])),
        )
        writeRecord(TEMPLATES_KEY, { ...readRecord<ApplicationTemplate>(TEMPLATES_KEY), [template.id]: template })
        return template
      },
      ['template'],
    ),
  async confirmTemplate(id, sections) {
    const next = { ...findTemplate(id), sections }
    writeRecord(TEMPLATES_KEY, { ...readRecord<ApplicationTemplate>(TEMPLATES_KEY), [id]: next })
    return next
  },

  // Applications live in the browser like projects and teams: the backend has no drafts yet.
  async createApplication({ projectId, variantId, templateId, callId }) {
    const template = findTemplate(templateId)
    const match = readRecord<MatchResult>(MATCHES_KEY)[projectId]
    const variant = match?.variants.find((v) => v.id === variantId)
    const app: ApplicationDraft = {
      id: uid('application'),
      variant_id: variantId,
      call_id: callId ?? '',
      language: template.language,
      template_id: template.id,
      template_status: template.status,
      sections: template.sections.map((sec) => {
        // Only the team is known for certain; everything else starts empty (no invented text).
        const content = sec.key === 'team' && match && variant ? teamSection(variant, match.groups) : ''
        return { key: sec.key, title: sec.title, required: sec.required, content_md: content, ai_generated: false, limits: sec.limits }
      }),
      isvp_fields: [],
      page_estimate: 0,
      checks: [],
    }
    writeRecord(APPLICATIONS_KEY, { ...readRecord<ApplicationDraft>(APPLICATIONS_KEY), [app.id]: app })
    return app
  },
  async getApplication(id) {
    const app = readRecord<ApplicationDraft>(APPLICATIONS_KEY)[id]
    if (!app) throw new Error('Přihláška nebyla nalezena.')
    return app
  },
  async saveSection(id, key, content) {
    const apps = readRecord<ApplicationDraft>(APPLICATIONS_KEY)
    const app = apps[id]
    if (!app) throw new Error('Přihláška nebyla nalezena.')
    const next = { ...app, sections: app.sections.map((s) => (s.key === key ? { ...s, content_md: content, ai_generated: false } : s)) }
    writeRecord(APPLICATIONS_KEY, { ...apps, [id]: next })
    return next
  },
  /**
   * POST /copilot — one opponent for the whole application (§9.4.1). The backend is stateless:
   * it gets the application as stored here, plus the project, team and the chat history.
   */
  applicationPdf: (input) => postBlob('/application/pdf', input, AbortSignal.timeout(60_000)),
  copilot: (id, input) =>
    streamResult(
      async (signal) => {
        const app = readRecord<ApplicationDraft>(APPLICATIONS_KEY)[id]
        if (!app) throw new Error('Přihláška nebyla nalezena.')
        const template = findTemplate(app.template_id)
        // The application belongs to the project whose teams contain its variant.
        const [projectId, match] =
          Object.entries(readRecord<MatchResult>(MATCHES_KEY)).find(([, m]) => m.variants.some((v) => v.id === app.variant_id)) ?? []
        if (!projectId || !match) throw new Error('K přihlášce chybí projekt. Otevřete ji znovu z kroku Týmy.')
        const intent = readProject(projectId).intent
        const variant = match.variants.find((v) => v.id === app.variant_id)
        const histories = readRecord<CopilotTurn[]>(COPILOT_KEY)
        // Quick replies of the demo copilot ("variant:…") are not a message for the backend.
        const instruction = input.instruction && !input.instruction.startsWith('variant:') ? input.instruction : undefined
        const tplSection = new Map(template.sections.map((s) => [s.key, s]))

        const body: CopilotRequest = {
          mode: input.mode,
          section_key: input.section_key ?? null,
          instruction: instruction ?? null,
          project: intent.prompt,
          title: intent.title ?? '',
          grant: app.call_id || null,
          template: {
            status: template.status,
            agency: template.agency,
            scheme: template.scheme,
            language: template.language,
            document_limits: template.document_limits ?? null,
            unknown: template.unknown,
          },
          sections: app.sections.map((s) => ({
            key: s.key,
            title: s.title,
            required: s.required,
            hint: tplSection.get(s.key)?.hint ?? '',
            content: s.content_md,
            limits: s.limits ?? null,
            confirmed: tplSection.get(s.key)?.confirmed ?? true,
          })),
          team: (variant?.members ?? []).slice(0, 10).map((m) => ({ group: m.group_id, role: m.role })),
          history: (histories[id] ?? []).slice(-20),
        }
        const result = toCopilotResult(
          await postJson<BackendCopilotResult>('/copilot', body, AbortSignal.any([signal, AbortSignal.timeout(150_000)])),
        )

        if (result.section_patch) {
          const { section_key, content_md } = result.section_patch
          const apps = readRecord<ApplicationDraft>(APPLICATIONS_KEY)
          const current = apps[id]
          if (current) {
            const sections = current.sections.map((s) => (s.key === section_key ? { ...s, content_md, ai_generated: true } : s))
            writeRecord(APPLICATIONS_KEY, { ...apps, [id]: { ...current, sections } })
          }
        }
        if (instruction && result.reply) {
          const turns: CopilotTurn[] = [...(histories[id] ?? []), { role: 'user', content: instruction }, { role: 'assistant', content: result.reply }]
          writeRecord(COPILOT_KEY, { ...readRecord<CopilotTurn[]>(COPILOT_KEY), [id]: turns.slice(-20) })
        }
        return result
      },
      [input.mode === 'write' ? 'write' : 'oppose'],
    ),
}
