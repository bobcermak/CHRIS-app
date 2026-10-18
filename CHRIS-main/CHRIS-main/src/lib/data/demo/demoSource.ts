import type {
  ApplicationDraft,
  ApplicationTemplate,
  ClarifyAnswer,
  ClarifyRound,
  EmailDraft,
  EmailTone,
  Gap,
  GrantInfo,
  Group,
  IntentCard,
  MatchResult,
  RecomputeRequest,
  ResearchReport,
  Scored,
  Strategy,
  TeamDiff,
  TeamVariant,
} from '../contract'
import type { CreateApplicationInput, DataSource } from '../source'
import { withMember } from '../team'
import { opposeDemo, writeDemo } from './copilot'
import { buildMember, demoCitation, SCENARIOS, scenarioByKey, scenarioFor, type Scenario, type ScenarioMember } from './scenarios'
import { safeLocalStorage } from '../../storage'
import { simulate } from './stream'
import { resolveDemoTemplate, TEMPLATE_LIBRARY } from './templates'

// ---- persistence (localStorage, so projects survive a refresh and can be reopened from the home page) ----

interface ProjectRecord {
  intent: IntentCard
  scenario: Scenario['key']
  round: number
  empty: boolean
  failMatch: boolean
}

interface DemoDb {
  projects: Record<string, ProjectRecord>
  matches: Record<string, MatchResult>
  applications: Record<string, ApplicationDraft>
  templates: Record<string, ApplicationTemplate>
  /** Every variant ever produced, so a reverted variant can be recomputed again. */
  variants: Record<string, TeamVariant>
}

const KEY = 'chris:demo-db:v1'

function load(): DemoDb {
  try {
    const raw = safeLocalStorage.getItem(KEY) as string | null
    if (raw) return { projects: {}, matches: {}, applications: {}, templates: {}, variants: {}, ...(JSON.parse(raw) as Partial<DemoDb>) }
  } catch {
    // storage unavailable — fall through to an empty db
  }
  return { projects: {}, matches: {}, applications: {}, templates: {}, variants: {} }
}

const db = load()

function persist() {
  try {
    safeLocalStorage.setItem(KEY, JSON.stringify(db))
  } catch {
    // ignore quota / private mode
  }
}

const uid = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`

function notFound(what: string): never {
  throw new Error(`${what} nebyl nalezen.`)
}

function project(id: string): ProjectRecord {
  return db.projects[id] ?? notFound('Projekt')
}

// ---- builders ----

const STRATEGIES: Strategy[] = ['INTELLIGENCE', 'GRANT']

const WEIGHTS: Record<Strategy, TeamVariant['weights']> = {
  INTELLIGENCE: { coverage: 0.55, complementarity: 0.25, grant: 0, existing_collab: 0.1, new_link: 0.1 },
  GRANT: { coverage: 0.35, complementarity: 0.1, grant: 0.4, existing_collab: 0.1, new_link: 0.05 },
  BALANCED: { coverage: 0.45, complementarity: 0.2, grant: 0.2, existing_collab: 0.08, new_link: 0.07 },
}

function variant(s: Scenario, strategy: Strategy, members: ScenarioMember[], summary: string): TeamVariant {
  const gaps: Gap[] = members.length
    ? []
    : [{ slot_key: 'team_requirements', label: 'Žádná skupina nedosahuje požadované shody' }]
  return {
    id: `${strategy.toLowerCase()}-${Math.random().toString(36).slice(2, 7)}`,
    strategy,
    summary,
    members: members.map((m) => buildMember(s, m)),
    coverage: members.length ? Math.min(0.98, members.reduce((a, m) => a + m.total, 0) / members.length) : 0,
    gaps,
    grant_fit: s.grants[0]?.fit,
    tech: s.tech,
    grants: s.grants,
    weights: WEIGHTS[strategy],
  }
}

function citationsFor(s: Scenario) {
  return Object.fromEntries(
    s.groups.map((g) => [
      `c-${g.id}`,
      demoCitation(`c-${g.id}`, `${g.lab_name} — profil skupiny (demo)`, `${g.pi_name}, ${g.institution}`),
    ]),
  )
}

function groupsOf(s: Scenario): Record<string, Group> {
  return Object.fromEntries(s.groups.map((g) => [g.id, g]))
}

function sectionContent(s: Scenario, key: string): string {
  const map: Record<string, string | undefined> = {
    title: s.sections.title,
    abstract: s.sections.abstract,
    aims: s.sections.aims,
    methods: s.sections.methods,
  }
  return map[key] ?? ''
}

// ---- the demo source ----

export const demoSource: DataSource = {
  kind: 'demo',

  async createProject({ prompt }) {
    const s = scenarioFor(prompt)
    const intent: IntentCard = {
      id: uid('p'),
      prompt,
      title: s.title,
      summary: s.summary,
      slots: [],
      readiness: 0.45,
    }
    db.projects[intent.id] = {
      intent,
      scenario: s.key,
      round: 0,
      empty: /\bnikdo\b|prázdn/i.test(prompt),
      failMatch: /\[chyba\]/i.test(prompt),
    }
    persist()
    return intent
  },

  async deleteProject(id) {
    const match = db.matches[id]
    for (const v of match?.variants ?? []) delete db.variants[v.id]
    for (const [appId, app] of Object.entries(db.applications)) if (match?.variants.some((v) => v.id === app.variant_id)) delete db.applications[appId]
    delete db.matches[id]
    delete db.projects[id]
    persist()
  },

  async getProject(id) {
    return project(id).intent
  },

  clarify(projectId) {
    const rec = project(projectId)
    const s = scenarioByKey(rec.scenario)
    return simulate<ClarifyRound>(
      [
        ['decompose', 1600],
        ['clarify', 1200],
      ],
      () => {
        rec.round = 1
        persist()
        return { intent: rec.intent, questions: s.questions, round: 1, ready: false, reason: s.reason }
      },
    )
  },

  answer(projectId, answers: ClarifyAnswer[], finish) {
    const rec = project(projectId)
    const s = scenarioByKey(rec.scenario)
    return simulate<ClarifyRound>([['clarify', 1100]], () => {
      const answered = answers.filter((a) => !a.unknown && a.value).length
      rec.intent = { ...rec.intent, readiness: Math.min(1, rec.intent.readiness + 0.15 + answered * 0.08) }
      const askConfirm = !finish && rec.round === 1
      rec.round += 1
      if (!askConfirm) rec.intent = { ...rec.intent, readiness: Math.max(rec.intent.readiness, 0.82) }
      persist()
      return {
        intent: rec.intent,
        questions: askConfirm ? [s.confirm] : [],
        round: rec.round,
        ready: !askConfirm,
        reason: askConfirm ? 'Poslední ověření předpokladu.' : undefined,
      }
    })
  },

  match(projectId) {
    const rec = project(projectId)
    const s = scenarioByKey(rec.scenario)
    // Demo hook: a "[chyba]" prompt fails the first search once, so retry can be shown.
    const fail = rec.failMatch
    if (fail) {
      rec.failMatch = false
      persist()
    }
    return simulate<MatchResult>(
      [
        ['retrieval', 1400],
        ['scoring', 1000],
        ['compose', 1200],
        ['verify', 800],
      ],
      () => {
        const variants = STRATEGIES.map((st) =>
          variant(s, st, rec.empty ? [] : s.variants[st].members, rec.empty ? '' : s.variants[st].summary),
        )
        const result: MatchResult = { intent: rec.intent, variants, groups: groupsOf(s), citations: citationsFor(s) }
        db.matches[projectId] = result
        for (const v of variants) db.variants[v.id] = v
        persist()
        return result
      },
      fail ? 'Spojení s katalogem se přerušilo. Zkuste to prosím znovu.' : undefined,
    )
  },

  async getMatch(projectId) {
    return db.matches[projectId] ?? null
  },

  recompute(projectId, req: RecomputeRequest) {
    const rec = project(projectId)
    const s = scenarioByKey(rec.scenario)
    return simulate<TeamDiff>([['recompute', 1400], ['verify', 600]], () => {
      const match = db.matches[projectId] ?? notFound('Výsledek')
      const before = db.variants[req.variant_id] ?? match.variants.find((v) => v.id === req.variant_id) ?? notFound('Varianta')
      const action = new Map(req.actions.map((a) => [a.group_id, a.action]))
      const keep = before.members.filter((m) => (action.get(m.group_id) ?? 'keep') === 'keep')
      const excluded = new Set(before.members.map((m) => m.group_id))
      const toReplace = before.members.filter((m) => action.get(m.group_id) === 'replace').length

      const pool = s.bench.filter((b) => !excluded.has(b.group_id))
      const added = pool.slice(0, toReplace).map((b) => buildMember(s, b))
      const members = [...keep, ...added].sort((a, b) => b.total - a.total)

      const removedIds = before.members.filter((m) => action.get(m.group_id) !== undefined && action.get(m.group_id) !== 'keep').map((m) => m.group_id)
      const newGaps: Gap[] =
        added.length < toReplace
          ? [{ slot_key: 'team_requirements', label: 'Pro vyměňovanou roli jsem nenašel skupinu nad prahem shody.' }]
          : []

      const after: TeamVariant = {
        ...before,
        id: `${before.strategy.toLowerCase()}-${Math.random().toString(36).slice(2, 7)}`,
        members,
        coverage: members.length ? members.reduce((a, m) => a + m.total, 0) / members.length : 0,
        gaps: [...before.gaps, ...newGaps],
      }
      db.variants[after.id] = after
      match.variants = match.variants.map((v) => (v.strategy === before.strategy ? after : v))
      persist()
      return {
        before,
        after,
        added: added.map((m) => m.group_id),
        removed: removedIds,
        kept: keep.map((m) => m.group_id),
        coverage_delta: after.coverage - before.coverage,
        new_gaps: newGaps,
        closed_gaps: [],
        groups: groupsOf(s),
      }
    })
  },

  async revertVariant(projectId, variantId) {
    const match = db.matches[projectId] ?? notFound('Výsledek')
    const v = db.variants[variantId] ?? notFound('Varianta')
    match.variants = match.variants.map((x) => (x.strategy === v.strategy ? v : x))
    persist()
    return match
  },

  research(projectId, target) {
    const rec = project(projectId)
    const s = scenarioByKey(rec.scenario)
    return simulate<ResearchReport>([['research', 2200], ['verify', 800]], () => {
      const subject =
        target.kind === 'group'
          ? s.groups.find((g) => g.id === target.id)?.pi_name ?? 'skupina'
          : target.kind === 'tech'
            ? s.tech.find((t) => t.id === target.id)?.name ?? 'technologie'
            : s.grants.find((g) => g.call.id === target.id)?.call.name ?? 'výzva'
      const c1 = demoCitation(`r-${target.id}-1`, 'Ilustrační zdroj (demo)', subject)
      const c2 = demoCitation(`r-${target.id}-2`, 'Ilustrační zdroj (demo)', subject)
      const sections: ResearchReport['sections'] =
        target.kind === 'tech'
          ? [
              { key: 'alternatives', title: 'Alternativy', claims: [{ text: `Pro „${subject}“ existují v ČR nejméně dvě alternativní pracoviště; dostupnost ověřte přímo u core facility.`, citation_ids: [c1.id] }] },
              { key: 'publications', title: 'Srovnání z literatury', claims: [{ text: 'Srovnávací studie uvádějí kompromis mezi rozlišením a cenou analýzy na vzorek.', citation_ids: [c2.id] }] },
            ]
          : [
              { key: 'state', title: 'Co skupina dělá', claims: [{ text: `${subject}: hlavní témata a aktuální projekty podle veřejného profilu.`, citation_ids: [c1.id] }] },
              { key: 'publications', title: 'Klíčové publikace', claims: [{ text: 'Tři nejcitovanější práce za posledních pět let se týkají tématu projektu.', citation_ids: [c2.id] }] },
              { key: 'competition', title: 'Projekty a spolupráce', claims: [{ text: 'Skupina má běžící projekt, který končí příští rok; kapacita se uvolní.', citation_ids: [c1.id] }] },
            ]
      return { target, sections, citations: { [c1.id]: c1, [c2.id]: c2 } }
    })
  },

  async emailDraft(projectId, groupId, tone: EmailTone) {
    const rec = project(projectId)
    const s = scenarioByKey(rec.scenario)
    const g = s.groups.find((x) => x.id === groupId) ?? notFound('Skupina')
    const salutation = 'Dobrý den,'
    const bodies: Record<EmailTone, string> = {
      default: `${salutation}\n\npřipravujeme projekt „${rec.intent.title}“ a Vaše skupina by do týmu přinesla ${(g.tags ?? []).slice(0, 2).join(' a ').toLowerCase()}. Rádi bychom s Vámi probrali možnou spolupráci, ideálně na krátké schůzce v příštích dvou týdnech.\n\nS pozdravem`,
      formal: `${salutation}\n\ndovolujeme si Vás oslovit s nabídkou spolupráce na projektu „${rec.intent.title}“. Na základě zaměření Vaší skupiny (${(g.tags ?? []).join(', ')}) se domníváme, že by Vaše účast výrazně posílila odbornou úroveň projektu. Budeme rádi, pokud nám sdělíte, zda by pro Vás byla spolupráce zajímavá, a navrhnete termín úvodní schůzky.\n\nS úctou`,
      short: `${salutation}\n\nchystáme projekt „${rec.intent.title}“ a hodila by se nám Vaše expertíza. Máte v příštích dvou týdnech 20 minut na krátký hovor?\n\nDěkuji`,
    }
    const draft: EmailDraft = {
      to: g.email ?? '',
      subject: `Nabídka spolupráce: ${rec.intent.title}`,
      body: bodies[tone],
      language: 'cs',
      group_id: groupId,
    }
    return draft
  },

  async templates() {
    return TEMPLATE_LIBRARY
  },

  async getTemplate(id) {
    return db.templates[id] ?? TEMPLATE_LIBRARY.find((x) => x.id === id) ?? notFound('Šablona')
  },

  resolveTemplate(input) {
    return simulate<ApplicationTemplate>([['template', 2000]], () => {
      const t = resolveDemoTemplate(input)
      db.templates[t.id] = t
      persist()
      return t
    })
  },

  async confirmTemplate(id, sections) {
    const t = db.templates[id] ?? TEMPLATE_LIBRARY.find((x) => x.id === id) ?? notFound('Šablona')
    const next = { ...t, sections }
    db.templates[id] = next
    persist()
    return next
  },

  async createApplication(input: CreateApplicationInput) {
    const rec = project(input.projectId)
    const s = scenarioByKey(rec.scenario)
    const t = db.templates[input.templateId] ?? TEMPLATE_LIBRARY.find((x) => x.id === input.templateId) ?? notFound('Šablona')
    const app: ApplicationDraft = {
      id: uid('a'),
      variant_id: input.variantId,
      call_id: input.callId ?? '',
      language: t.language,
      template_id: t.id,
      template_status: t.status,
      sections: t.sections.map((sec) => {
        const content = sectionContent(s, sec.key)
        return { key: sec.key, title: sec.title, required: sec.required, content_md: content, ai_generated: Boolean(content), limits: sec.limits }
      }),
      isvp_fields: [],
      page_estimate: 0,
      checks: [],
    }
    db.applications[app.id] = app
    persist()
    return app
  },

  async getApplication(id) {
    return db.applications[id] ?? notFound('Přihláška')
  },

  async saveSection(id, key, content) {
    const app = db.applications[id] ?? notFound('Přihláška')
    app.sections = app.sections.map((s) => (s.key === key ? { ...s, content_md: content, ai_generated: false } : s))
    persist()
    return app
  },

  // No backend in the demo: the page prints the application to PDF in the browser instead.
  async applicationPdf() {
    return null
  },
  copilot(id, input) {
    const stage = input.mode === 'write' ? 'write' : 'oppose'
    return simulate([[stage, input.mode === 'write' ? 2000 : 1600]], () => {
      const app = db.applications[id] ?? notFound('Přihláška')
      if (input.mode === 'write') {
        const result = writeDemo(app, input.section_key ?? 'team')
        if (result.section_patch) {
          const { section_key, content_md } = result.section_patch
          app.sections = app.sections.map((s) => (s.key === section_key ? { ...s, content_md, ai_generated: true } : s))
          persist()
        }
        return result
      }
      return opposeDemo(app, input.instruction)
    })
  },

  async addMember(projectId, variantId, input) {
    const match = db.matches[projectId] ?? notFound('Výsledek')
    db.matches[projectId] = withMember(match, variantId, input)
    persist()
    return db.matches[projectId]
  },

  async restoreVariant(projectId, variant) {
    const match = db.matches[projectId] ?? notFound('Výsledek')
    match.variants = match.variants.map((v) => (v.strategy === variant.strategy ? variant : v))
    persist()
    return match
  },


  async groups(filter = {}) {
    return DEMO_GROUPS.filter((g) => (!filter.node || g.node === filter.node) && (!filter.program || g.programs.includes(filter.program)))
  },
  async searchGroups(q, topK = 12) {
    return rank(DEMO_GROUPS, q, groupText).slice(0, topK)
  },
  async getGroup(slug) {
    return DEMO_GROUPS.find((g) => g.slug === slug) ?? notFound('Skupina')
  },
  async grants(agency) {
    return DEMO_GRANTS.filter((g) => !agency || g.agency === agency)
  },
  async searchGrants(q, topK = 12) {
    return rank(DEMO_GRANTS, q, grantText).slice(0, topK)
  },
  async getGrant(slug) {
    return DEMO_GRANTS.find((g) => g.slug === slug) ?? notFound('Grant')
  },
  async health() {
    return { status: 'demo', groups: DEMO_GROUPS.length, grants: DEMO_GRANTS.length }
  },
}

// ---- catalogue (fictional fixtures; the backend ranks by embeddings, the demo by shared words) ----

const DEMO_GROUPS: Group[] = [...new Map(SCENARIOS.flatMap((s) => s.groups).map((g) => [g.slug, g])).values()]

const DEMO_GRANTS: GrantInfo[] = [
  ...new Map(
    SCENARIOS.flatMap((s) => s.grants).map(({ call }) => [
      call.id,
      {
        slug: call.id,
        title: call.name,
        agency: call.provider,
        programme: '',
        call_id: '',
        url: call.url,
        deadline: call.deadline ?? '',
        budget: '',
        duration: '',
        description: '',
        keywords: [],
        eligible_applicants: '',
      } satisfies GrantInfo,
    ]),
  ).values(),
]

const groupText = (g: Group) => [g.lab_name, g.pi_name, g.institution, ...(g.tags ?? []), ...(g.dimensions.research?.items ?? [])].join(' ')
const grantText = (g: GrantInfo) => [g.title, g.agency, g.programme, g.description, ...(g.keywords ?? [])].join(' ')

function rank<T>(items: T[], q: string, text: (item: T) => string): Scored<T>[] {
  const words = q.toLocaleLowerCase('cs').split(/\s+/).filter((w) => w.length > 2)
  if (!words.length) return []
  return items
    .map((item) => {
      const hay = text(item).toLocaleLowerCase('cs')
      return { item, score: words.filter((w) => hay.includes(w)).length / words.length }
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
}
