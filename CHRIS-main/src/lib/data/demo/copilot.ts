import type { ApplicationDraft, CopilotComment, CopilotResult } from '../contract'

// Demo copilot. Oppose-first per ARCHITECTURE §9.4.1: no praise, severity order,
// every comment tied to a section and a rule/criterion, concrete fix.

const RANK: Record<CopilotComment['severity'], number> = { blocker: 0, warning: 1, suggestion: 2, info: 3 }

const sortBySeverity = (c: CopilotComment[]) => [...c].sort((a, b) => RANK[a.severity] - RANK[b.severity])

let seq = 0
const id = () => `cc-${(++seq).toString(36)}`

export function opposeDemo(app: ApplicationDraft, instruction?: string): CopilotResult {
  const empty = app.sections.filter((s) => s.required && !s.content_md.trim())
  const comments: CopilotComment[] = empty.map((s) => ({
    id: id(),
    section_key: s.key,
    mode: 'oppose',
    severity: 'blocker',
    text: `Sekce „${s.title}“ je prázdná. Bez ní přihláška neprojde formální kontrolou.`,
    criterion: 'Formální úplnost podle šablony výzvy',
  }))

  const methods = app.sections.find((s) => s.key === 'methods' && s.content_md.trim())
  if (methods) {
    comments.push({
      id: id(),
      section_key: 'methods',
      mode: 'oppose',
      severity: 'warning',
      text:
        'Metodika neuvádí statistické zdůvodnění velikosti souboru. Zpravodaj to označí za neověřenou proveditelnost. Doplňte power analýzu: očekávaný efekt, hladinu α, sílu testu a výsledné n.',
      criterion: 'Proveditelnost · experimentální design (osnova e)',
      suggested_edit:
        '\n\nVelikost souboru jsme stanovili power analýzou (α = 0,05, síla 0,8) pro očekávaný efekt z pilotních dat; výsledné n doplníme po potvrzení pilotu.',
    })
  }

  if (app.sections.some((s) => s.key === 'team')) {
    comments.push({
      id: id(),
      section_key: 'team',
      mode: 'oppose',
      severity: 'info',
      text: 'Kterou variantu týmu mám uvést v sekci Řešitelský tým?',
      options: [
        { id: 'INTELLIGENCE', label: 'Intelligence-first' },
        { id: 'GRANT', label: 'Grant-first' },
      ],
    })
  }

  if (app.sections.some((s) => s.key === 'dmp' && !s.content_md.trim())) {
    comments.push({
      id: id(),
      section_key: 'dmp',
      mode: 'oppose',
      severity: 'suggestion',
      text: 'Výzva vyžaduje Data management plan podle FAIR. Mohu připravit návrh podle technologií z vybraného týmu.',
      criterion: 'Výzkumná data (osnova m)',
      options: [{ id: 'write-dmp', label: 'Připravit DMP' }],
    })
  }

  const filled = app.sections.filter((s) => s.content_md.trim()).length
  const ratio = app.sections.length ? filled / app.sections.length : 0
  const feas = Math.round(10 + ratio * 14)
  const team = app.sections.some((s) => s.key === 'team' && s.content_md.trim()) ? 15 : 6
  const quality = Math.round(16 + ratio * 8)
  const impact = Math.round(10 + ratio * 6)

  return {
    comments: sortBySeverity([...formalDemo(app), ...comments]),
    // Demo chat: a fixed, honest answer — the real one comes from the backend copilot.
    reply: instruction
      ? 'Ukázková odpověď copilota (demo). Nejvíc bodů teď ztrácíte na proveditelnosti: doplňte do Metodiky zdůvodnění velikosti souboru a do Harmonogramu milníky po letech.'
      : undefined,
    score: {
      total: quality + feas + team + impact,
      criteria: [
        { name: 'Kvalita a originalita', score: quality, max: 30, reason: 'Jasná vědecká otázka, chybí vymezení vůči konkurenčním projektům.' },
        { name: 'Proveditelnost', score: feas, max: 30, reason: 'Bez zdůvodnění velikosti souboru a harmonogramu nelze proveditelnost ověřit.' },
        { name: 'Tým a pracoviště', score: team, max: 20, reason: team > 10 ? 'Role členů jsou popsané.' : 'Sekce týmu chybí, panel nemůže posoudit kapacity.' },
        { name: 'Dopad', score: impact, max: 20, reason: 'Výsledky jsou uvedené, chybí cesta k uplatnění.' },
      ],
    },
  }
}

const WRITE_TEXT: Record<string, string> = {
  team:
    'Řešitelský tým tvoří skupiny vybrané variantou týmu. Řešitel koordinuje projekt a odpovídá za klinickou část; spolunavrhovatelé pokrývají laboratorní analýzy, technologii a statistiku. Role a úvazky jsou rozděleny tak, aby se nepřekrývaly.',
  timeline:
    'Rok 1: příprava protokolu, sběr vzorků, pilotní analýzy.\nRok 2: hlavní analýzy a integrace dat.\nRok 3: validace a ověření v modelu.\nRok 4: publikace a příprava navazujícího projektu.',
  risks:
    'Riziko: nižší počet vzorků, než se plánuje. Zmírnění: zapojení druhého klinického pracoviště.\nRiziko: technické selhání analýzy. Zmírnění: záložní zpracování v core facility.',
  dmp:
    'Data budou ukládána v institucionálním repozitáři s řízeným přístupem. Metadata budou popsána podle FAIR principů a anonymizovaná data budou po publikaci zpřístupněna.',
  outputs: 'Dvě publikace v časopisech Q1, otevřená datová sada a ověřená metodika.',
}

export function writeDemo(app: ApplicationDraft, sectionKey: string): CopilotResult {
  const section = app.sections.find((s) => s.key === sectionKey)
  const text = WRITE_TEXT[sectionKey] ?? 'Návrh textu sekce podle dat týmu a technologií.'
  return {
    section_patch: { section_key: sectionKey, content_md: text },
    comments: [
      {
        id: id(),
        section_key: sectionKey,
        mode: 'write',
        severity: 'warning',
        text: `Návrh sekce „${section?.title ?? sectionKey}“ je AI draft. Nejslabší místo: chybí konkrétní čísla (úvazky, počty vzorků, termíny). Doplňte je, jinak zpravodaj text označí za obecný.`,
        criterion: 'Konkrétnost a ověřitelnost tvrzení',
      },
    ],
  }
}

/** Formal part of the review (limits, template state) — the backend computes it the same way. */
function formalDemo(app: ApplicationDraft): CopilotComment[] {
  const comments: CopilotComment[] = []
  for (const s of app.sections) {
    const max = s.limits?.max_chars
    if (max && s.content_md.length > max) {
      comments.push({
        id: id(),
        section_key: s.key,
        mode: 'oppose',
        severity: 'blocker',
        text: `Sekce „${s.title}“ má ${s.content_md.length} znaků, limit je ${max}. Zkraťte ji o ${s.content_md.length - max} znaků.`,
        criterion: 'Limit znaků podle šablony',
      })
    }
  }
  if (app.template_status !== 'verified') {
    comments.push({
      id: id(),
      section_key: '',
      mode: 'oppose',
      severity: 'warning',
      text: 'Šablona nebyla ověřena proti oficiální dokumentaci výzvy. Nepotvrzené sekce kontroluji jen obecně.',
      criterion: 'Stav šablony',
    })
  }
  return comments
}
