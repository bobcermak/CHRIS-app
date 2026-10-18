import type {
  ApplicationDraft,
  ApplicationTemplate,
  BackendHealth,
  GrantInfo,
  Group,
  GroupFilter,
  Scored,
  ClarifyAnswer,
  ClarifyRound,
  CopilotMode,
  CopilotResult,
  CreateProjectInput,
  EmailDraft,
  EmailTone,
  IntentCard,
  MatchResult,
  RecomputeRequest,
  ResearchReport,
  StreamEvent,
  TeamDiff,
  TeamVariant,
  TemplateResolveInput,
  TemplateSection,
} from './contract'
import type { AddMemberInput } from './team'

/**
 * A streamed operation (SSE on the backend). It yields `thinking` / `progress` events
 * and ends with `result` (data: T) or `error`. Abort via the signal.
 */
export interface StreamOp<T> {
  (signal: AbortSignal): AsyncIterable<StreamEvent>
  /** Phantom type of the final `result` payload. */
  readonly __result?: T
}

export interface CreateApplicationInput {
  projectId: string
  variantId: string
  templateId: string
  callId?: string
}

export interface ApplicationPdfInput {
  title: string
  /** Line above the title: scheme, call. */
  subtitle: string
  sections: { title: string; content_md: string }[]
  /** Extra footer notices; the AI-draft notice is always added by the backend. */
  notices: string[]
}

export interface CopilotInput {
  mode: CopilotMode
  section_key?: string
  instruction?: string
}

/**
 * Everything the UI needs from the backend. Two implementations: demo (local fixtures)
 * and api (the FastAPI adapter). Components never talk to either directly — only via `lib/queries`.
 */
export interface DataSource {
  readonly kind: 'demo' | 'api'

  createProject(input: CreateProjectInput): Promise<IntentCard>
  getProject(id: string): Promise<IntentCard>
  /** Forget a project and everything derived from it. PROPOSED endpoint. */
  deleteProject(id: string): Promise<void>
  clarify(projectId: string): StreamOp<ClarifyRound>
  answer(projectId: string, answers: ClarifyAnswer[], finish: boolean): StreamOp<ClarifyRound>

  match(projectId: string): StreamOp<MatchResult>
  getMatch(projectId: string): Promise<MatchResult | null>
  recompute(projectId: string, req: RecomputeRequest): StreamOp<TeamDiff>
  /** Add a group the user picked (by description or from the list) to a variant. */
  addMember(projectId: string, variantId: string, input: AddMemberInput): Promise<MatchResult>
  /** Put a variant back as it was (cancelling an edit) — replaces the variant of its strategy. */
  restoreVariant(projectId: string, variant: TeamVariant): Promise<MatchResult>
  /** "Vrátit změnu" — make a previous variant current again. PROPOSED endpoint. */
  revertVariant(projectId: string, variantId: string): Promise<MatchResult>

  research(projectId: string, target: ResearchReport['target']): StreamOp<ResearchReport>
  emailDraft(projectId: string, groupId: string, tone: EmailTone): Promise<EmailDraft>

  templates(): Promise<ApplicationTemplate[]>
  getTemplate(id: string): Promise<ApplicationTemplate>
  resolveTemplate(input: TemplateResolveInput): StreamOp<ApplicationTemplate>
  confirmTemplate(id: string, sections: TemplateSection[]): Promise<ApplicationTemplate>

  /** Catalogue: research groups (`/groups`, `/groups/search`, `/groups/{slug}`). */
  groups(filter?: GroupFilter): Promise<Group[]>
  searchGroups(q: string, topK?: number): Promise<Scored<Group>[]>
  getGroup(slug: string): Promise<Group>
  /** Catalogue: grant calls (`/grants`, `/grants/search`, `/grants/{slug}`). */
  grants(agency?: string): Promise<GrantInfo[]>
  searchGrants(q: string, topK?: number): Promise<Scored<GrantInfo>[]>
  getGrant(slug: string): Promise<GrantInfo>
  health(): Promise<BackendHealth>

  createApplication(input: CreateApplicationInput): Promise<ApplicationDraft>
  getApplication(id: string): Promise<ApplicationDraft>
  saveSection(id: string, key: string, content: string): Promise<ApplicationDraft>
  copilot(id: string, input: CopilotInput): StreamOp<CopilotResult>
  /**
   * The application as a downloadable A4 PDF (`POST /application/pdf`). Null where there is no
   * backend (demo) — the page then falls back to the browser's print-to-PDF.
   */
  applicationPdf(input: ApplicationPdfInput): Promise<Blob | null>
}
