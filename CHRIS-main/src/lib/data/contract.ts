/**
 * TEMPORARY until the backend exists: mirror of ARCHITECTURE.md §7.
 * When the backend is connected, replace each type with an alias to the generated schema,
 * e.g. `export type TeamVariant = components['schemas']['TeamVariant']`.
 *
 * Fields marked `PROPOSED` are not in §7 yet; the UI needs them and the backend should add them.
 */
import type { components } from '../api/schema'

export type Dimension = 'research' | 'tech' | 'output' | 'bio' | 'clinic' | 'people'
export type Strategy = 'INTELLIGENCE' | 'GRANT' | 'BALANCED'
export type Priority = 'must' | 'nice'
export type Freshness = 'verified' | 'web' | 'stale'

export interface Citation {
  id: string
  url: string
  source: 'nuvr' | 'openalex' | 'europepmc' | 'orcid' | 'cep' | 'cordis' | 'azv' | 'user'
  title?: string
  snippet: string
  fetched_at: string
}

export interface Warning {
  code: string
  severity: 'info' | 'warn' | 'risk'
  text: string
  why_url?: string
}

// ---- project (intent) and clarification ----
export interface Slot {
  key: string
  dimension?: Dimension
  value: string | string[] | number | null
  priority: Priority
  confidence: number
  assumed: boolean
}

export interface StudyName {
  acronym: string
  expansion: string
  alternatives: { acronym: string; expansion: string }[]
}

export interface IntentCard {
  id: string
  prompt: string
  /** PROPOSED: short project title shown as the page heading. */
  title: string
  summary: string
  slots: Slot[]
  readiness: number
  study_name?: StudyName
  /**
   * PROPOSED: what clarification distilled for searching the catalogue — the enriched project
   * description, the researcher's own group(s) never to propose, preferred nodes.
   */
  search?: { query: string; exclude_slugs: string[]; nodes: string[] }
}

export type QuestionKind =
  | 'single_choice'
  | 'multi_choice'
  | 'free_text'
  | 'scale'
  | 'yes_no'
  | 'date'
  | 'file'
  | 'confirm_assumption'

/** PROPOSED: body of POST /api/intents — the prompt plus structured context from the composer. */
export interface CreateProjectInput {
  prompt: string
  /** Metadata of attached files; contents are uploaded separately (POST /api/intents/{id}/upload). */
  attachments: { name: string; size: number; type: string }[]
  /** Links the user added (web page or DOI). */
  links: { kind: 'url' | 'doi'; value: string }[]
  /** Grant call the project aims at; "unknown" = not decided yet. */
  call: 'AZV' | 'GACR' | 'TACR' | 'HORIZON' | 'unknown' | null
  /** The user's own group, so it is never proposed as a partner. */
  own_group: { orcid?: string; name?: string } | null
  /** Quick search, or deep research before composing teams. */
  mode: 'quick' | 'deep'
}

export interface ClarifyQuestion {
  id: string
  slot_key: string
  kind: QuestionKind
  text: string
  why: string
  /** PROPOSED: placeholder / example answer for free text. */
  placeholder?: string
  options?: { id: string; label: string; hint?: string }[]
  suggested?: string | string[]
  impact_preview?: { before: number; after_estimate: number }
  allow_skip: true
}

export interface ClarifyRound {
  intent: IntentCard
  questions: ClarifyQuestion[]
  round: number
  ready: boolean
  /** PROPOSED: one sentence on why we ask ("V zadání chybí technologie a požadavky na lidi."). */
  reason?: string
}

export interface ClarifyAnswer {
  question_id: string
  value: string | string[] | null
  /** User pressed "Nevím" — the AI assumes. */
  unknown?: boolean
}

// ---- catalogue ----
export interface Group {
  id: string
  slug: string
  lab_name: string
  pi_name: string
  node: 'Praha' | 'Brno' | 'Olomouc'
  institution: string
  /** PROPOSED: department / workplace shown after the institution. */
  department?: string
  /** PROPOSED: number of people in the group. */
  size?: number
  programs: string[]
  web_url?: string
  email?: string
  /** Portrait of the group leader (nuvr.cz). Missing → initials. */
  photo_url?: string
  /** PROPOSED: short expertise tags. */
  tags?: string[]
  dimensions: Partial<Record<Dimension, { items: string[]; citations: Citation[] }>>
  collaborations: string[]
  infrastructures: string[]
  freshness: Freshness
  modified_at: string
  owner?: string
}

/** Grant call from the catalogue (`/grants`, `/grants/{slug}`) — alias of the backend schema. */
export type GrantInfo = components['schemas']['Grant']

/** A semantic search hit (`/groups/search`, `/grants/search`): similarity 0–1. */
export interface Scored<T> {
  score: number
  item: T
}

export interface GroupFilter {
  node?: Group['node']
  program?: string
}

/** PROPOSED: `/health` has no response model in the OpenAPI yet; this is what it returns. */
export interface BackendHealth {
  status: string
  groups: number
  grants: number
}

// ---- recommendation ----
export interface Claim {
  text: string
  citation_ids: string[]
}

export interface Explanation {
  why: Claim[]
  benefit: Claim[]
  gap: Claim[]
  first_step: Claim[]
}

export interface DimensionScore {
  dimension: Dimension
  score: number
}

export interface Member {
  group_id: string
  role: string
  covers: string[]
  scores: DimensionScore[]
  /** 0..1 match with the project. */
  total: number
  explanation: Explanation
  existing_collab_with: string[]
  warnings: Warning[]
}

export interface Gap {
  slot_key: string
  label: string
  suggestion?: { kind: 'external' | 'infrastructure'; name: string; citation_ids: string[] }
}

export interface StrategyWeights {
  coverage: number
  complementarity: number
  grant: number
  existing_collab: number
  new_link: number
}

export interface TechResource {
  id: string
  name: string
  /** PROPOSED: LLM-written one-liner about the technology (what it is and when to use it). */
  description?: string
  where: { group_id?: string; institution: string; node: string; infrastructure?: string }
  access: string
  citations: Citation[]
  /** PROPOSED: groups of the team through which the technology is reachable. */
  group_ids?: string[]
}

export interface GrantCall {
  id: string
  agency: 'AZV' | 'GACR' | 'TACR' | 'HORIZON' | 'OTHER'
  /** PROPOSED: display name of the provider ("AZV ČR", "Evropská komise"). */
  provider: string
  name: string
  deadline?: string
  status: 'open' | 'upcoming' | 'closed'
  rules_id: string
  template_id?: string
  url: string
}

export interface EligibilityCheck {
  rule: string
  status: 'ok' | 'warn' | 'fail' | 'unknown'
  detail?: string
  citation_ids: string[]
}

export interface GrantMatch {
  call: GrantCall
  fit: number
  checks: EligibilityCheck[]
}

export interface TeamVariant {
  id: string
  strategy: Strategy
  /** PROPOSED: plain description of the team (no score, no strengths/weaknesses). */
  summary: string
  members: Member[]
  coverage: number
  gaps: Gap[]
  grant_fit?: number
  tech: TechResource[]
  grants: GrantMatch[]
  weights: StrategyWeights
}

/** PROPOSED: result of POST /api/intents/{id}/match — variants plus the groups they reference. */
export interface MatchResult {
  intent: IntentCard
  variants: TeamVariant[]
  groups: Record<string, Group>
  citations: Record<string, Citation>
}

// ---- team change ----
export type MemberAction = 'keep' | 'replace' | 'remove'

export interface RecomputeRequest {
  variant_id: string
  actions: { group_id: string; action: MemberAction; reason?: string }[]
  free_text?: string
}

export interface TeamDiff {
  before: TeamVariant
  after: TeamVariant
  added: string[]
  removed: string[]
  kept: string[]
  coverage_delta: number
  new_gaps: Gap[]
  closed_gaps: Gap[]
  /** PROPOSED: groups newly referenced by `after`. */
  groups: Record<string, Group>
}

// ---- deep research ----
export type ResearchTarget =
  | { kind: 'group'; id: string }
  | { kind: 'tech'; id: string }
  | { kind: 'grant'; id: string }

/** PROPOSED shape of the deep research result (§8.4). */
export interface ResearchReport {
  target: ResearchTarget
  sections: { key: 'state' | 'novelty' | 'competition' | 'publications' | 'alternatives'; title: string; claims: Claim[] }[]
  citations: Record<string, Citation>
}

// ---- e-mail ----
export interface EmailDraft {
  to: string
  subject: string
  body: string
  language: 'cs' | 'en'
  group_id: string
}

export type EmailTone = 'default' | 'formal' | 'short'

// ---- application templates (§9.5) ----
export type TemplateStatus = 'verified' | 'derived' | 'extracted' | 'generic'

export interface TemplateLimits {
  max_chars?: number
  max_pages?: number
  max_words?: number
  font_pt?: number
  line_spacing?: number
  max_mb?: number
}

export interface TemplateSection {
  key: string
  title: string
  required: boolean
  hint: string
  limits?: TemplateLimits
  confirmed: boolean
  citation_ids: string[]
}

export interface ApplicationTemplate {
  id: string
  status: TemplateStatus
  agency: GrantCall['agency']
  scheme: string
  version: string
  language: 'en' | 'cs'
  based_on?: string
  diff?: string[]
  sections: TemplateSection[]
  document_limits?: TemplateLimits
  rules_id?: string
  source_url: string
  fetched_at: string
  unknown: string[]
  /** Places in the call documentation that `sections[].citation_ids` point to (extracted templates). */
  citations?: TemplateCitation[]
  /** Why the result is weaker than asked for: generic fallback, scanned PDF, truncated documentation. */
  warning?: string
}

/** A page of a PDF or a part of a web page / DOCX in the call documentation. */
export type TemplateCitation = components['schemas']['TemplateCitation']

/**
 * Documentation of a call without a library template: its page (linked documents are followed),
 * a direct PDF/DOCX link, or an uploaded file. `call_id` = the grant it is for, when known.
 */
export type TemplateResolveInput =
  | { call_id: string }
  | { url: string; call_id?: string }
  | { file: File; call_id?: string }

// ---- application ----
/** One persona (§9.4.1): `oppose` reviews the whole application; `write` drafts one section, still as the opponent. */
export type CopilotMode = 'write' | 'oppose'

export interface ApplicationSection {
  key: string
  title: string
  required: boolean
  content_md: string
  ai_generated: boolean
  limits?: TemplateLimits
}

export interface ApplicationDraft {
  id: string
  variant_id: string
  call_id: string
  language: 'en' | 'cs'
  template_id: string
  template_status: TemplateStatus
  sections: ApplicationSection[]
  isvp_fields: { key: string; label: string; value: string; max_chars?: number }[]
  page_estimate: number
  checks: EligibilityCheck[]
}

export interface CopilotComment {
  id: string
  section_key: string
  mode: CopilotMode
  severity: 'info' | 'suggestion' | 'warning' | 'blocker'
  text: string
  anchor?: { from: number; to: number }
  /** Exact passage of the section that `suggested_edit` replaces; without it the edit is appended. */
  quote?: string
  suggested_edit?: string
  score?: number
  /** PROPOSED: rule / criterion the comment is based on (with citation), §9.4.1. */
  criterion?: string
  /** PROPOSED: quick replies the user can pick ("Intelligence-first", …). */
  options?: { id: string; label: string }[]
}

/** PROPOSED: result of one copilot run — comments plus an optional per-criterion score. */
export interface CopilotResult {
  comments: CopilotComment[]
  score?: {
    total: number
    criteria: { name: string; score: number; max: number; reason: string }[]
    /** The call's own criteria weren't available; general ones were used. */
    general_criteria?: boolean
  }
  /** Answer to the user's message in the copilot chat. */
  reply?: string
  /** Write mode: the section text that was produced. */
  section_patch?: { section_key: string; content_md: string }
}

// ---- streaming ----
export type StreamEvent =
  | { type: 'thinking'; stage: string; verb?: string }
  | { type: 'progress'; stage: string; pct: number }
  | { type: 'partial'; path: string; data: unknown }
  | { type: 'warning'; warning: Warning }
  | { type: 'result'; data: unknown }
  | { type: 'error'; message: string; recoverable: boolean }
