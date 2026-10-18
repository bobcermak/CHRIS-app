// ARCHITECTURE.md §10.1 — the only approved "thinking" copy. Backend sends `stage`;
// a backend `verb` is shown only if it is listed here for that stage.

export type Stage =
  | 'decompose'
  | 'clarify'
  | 'retrieval'
  | 'scoring'
  | 'compose'
  | 'recompute'
  | 'verify'
  | 'research'
  | 'grants'
  | 'template'
  | 'write'
  | 'oppose'
  | 'check'
  | 'email'

const POOLS: Record<Stage | 'unknown', readonly string[]> = {
  decompose: [
    'Formuluji hypotézu…',
    'Izoluji proměnné…',
    'Definuji kontrolní skupinu…',
    'Rozkládám projekt na faktory…',
    'Stanovuji nulovou hypotézu…',
    'Vymezuji studovanou populaci…',
    'Mapuji stav poznání…',
    'Hledám slepá místa v literatuře…',
  ],
  clarify: [
    'Kalibruji…',
    'Titruji požadavky…',
    'Upřesňuji protokol…',
    'Zužuji inkluzní kritéria…',
    'Ladím parametry…',
    'Ověřuji předpoklady…',
    'Doplňuji metadata…',
  ],
  retrieval: [
    'Sekvenuji katalog…',
    'Amplifikuji signál…',
    'Filtruji šum…',
    'Prohledávám literaturu…',
    'Extrahuji vzorky…',
    'Indexuji publikace…',
    'Křížím databáze…',
    'Anotuji nálezy…',
  ],
  scoring: [
    'Kvantifikuji…',
    'Normalizuji…',
    'Počítám p-hodnoty…',
    'Vážím důkazy…',
    'Odhaduji velikost efektu…',
    'Kontroluji intervaly spolehlivosti…',
    'Koriguji na mnohočetné testování…',
  ],
  compose: [
    'Kultivuji tým…',
    'Inkubuji spolupráci…',
    'Centrifuguji kandidáty…',
    'Páruji komplementární skupiny…',
    'Hledám synergie…',
    'Skládám konsorcium…',
    'Mapuji spolupráce…',
  ],
  recompute: ['Opakuji experiment…', 'Měním podmínky…', 'Přepočítávám kohortu…', 'Porovnávám s kontrolou…'],
  verify: [
    'Validuji…',
    'Replikuji výsledky…',
    'Recenzuji citace…',
    'Ověřuji zdroje…',
    'Dohledávám DOI…',
    'Hledám konfoundery…',
    'Provádím slepou kontrolu…',
  ],
  research: [
    'Prohledávám archivy…',
    'Čtu supplementy…',
    'Sleduji citační stopu…',
    'Procházím preprinty…',
    'Dohledávám granty skupiny…',
  ],
  grants: [
    'Pipetuji rozpočet…',
    'Kontroluji etickou komisi…',
    'Čtu zadávací dokumentaci…',
    'Počítám režie…',
    'Ověřuji způsobilost…',
    'Hlídám termíny…',
  ],
  template: ['Preparuji osnovu…', 'Porovnávám se známými výzvami…', 'Měřím limity…', 'Značkuji sekce…'],
  write: [
    'Píšu metodiku…',
    'Barvím preparát…',
    'Formuluji cíle…',
    'Sestavuji Ganttův diagram…',
    'Píšu abstrakt…',
    'Formátuji literaturu…',
  ],
  oppose: ['Simuluji zpravodaje…', 'Hledám slabá místa…', 'Recenzuji návrh…', 'Bodově hodnotím…'],
  check: [
    'Počítám znaky…',
    'Měřím strany…',
    'Kontroluji citace dle ČSN ISO 690…',
    'Procházím pravidla výzvy…',
  ],
  email: ['Formuluji nabídku spolupráce…', 'Ladím tón…'],
  unknown: ['Zkoumám…', 'Bádám…', 'Analyzuji…', 'Experimentuji…', 'Pozoruji…', 'Měřím…'],
}

/** The house verb — CHRIS at work: always shown first, then it joins every stage's pool. */
export const BRAND_VERB = 'Chrisuji…'

export const VERBS: Record<Stage | 'unknown', readonly string[]> = { ...POOLS }
for (const stage of Object.keys(POOLS) as (Stage | 'unknown')[]) VERBS[stage] = [...POOLS[stage], BRAND_VERB]

/** Plain description announced to screen readers when the stage changes (not every verb). */
export const STAGE_LABEL: Record<Stage | 'unknown', string> = {
  decompose: 'Rozebírám zadání projektu',
  clarify: 'Připravuji upřesňující otázky',
  retrieval: 'Hledám skupiny v katalogu',
  scoring: 'Počítám shodu skupin',
  compose: 'Sestavuji varianty týmu',
  recompute: 'Přepočítávám tým',
  verify: 'Ověřuji zdroje a citace',
  research: 'Provádím deep research',
  grants: 'Vyhodnocuji granty',
  template: 'Připravuji šablonu přihlášky',
  write: 'Píšu návrh textu',
  oppose: 'Oponuji přihlášku',
  check: 'Kontroluji přihlášku',
  email: 'Připravuji e-mail',
  unknown: 'Pracuji na požadavku',
}

export function toStage(stage: string | undefined): Stage | 'unknown' {
  return stage && stage in VERBS ? (stage as Stage) : 'unknown'
}

/** Accept a backend verb only if it is approved for the stage. */
export function approvedVerb(stage: Stage | 'unknown', verb: string | undefined): string | undefined {
  return verb && VERBS[stage].includes(verb) ? verb : undefined
}
