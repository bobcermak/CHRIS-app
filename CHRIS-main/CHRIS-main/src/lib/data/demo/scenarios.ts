import type {
  Citation,
  ClarifyQuestion,
  Explanation,
  GrantMatch,
  Group,
  Member,
  Strategy,
  TechResource,
} from '../contract'

/**
 * Demo scenarios. All people and groups are FICTIONAL and illustrative; the UI labels them as demo data.
 * Citations point to the public NÚVR site only as a placeholder source.
 */

export interface ScenarioMember {
  group_id: string
  role: string
  total: number
}

export interface Scenario {
  key: 'oncology' | 'parkinson'
  title: string
  summary: string
  match: RegExp
  reason: string
  questions: ClarifyQuestion[]
  confirm: ClarifyQuestion
  groups: Group[]
  why: Record<string, string>
  variants: Record<Strategy, { summary: string; members: ScenarioMember[] }>
  /** Candidates offered when a member is replaced, best first. */
  bench: ScenarioMember[]
  tech: TechResource[]
  grants: GrantMatch[]
  sections: Record<string, string>
}

const DEMO_URL = 'https://www.nuvr.cz/'
const FETCHED = '2026-10-16T08:00:00Z'

export function demoCitation(id: string, title: string, snippet: string): Citation {
  return { id, url: DEMO_URL, source: 'nuvr', title, snippet, fetched_at: FETCHED }
}

function group(g: Omit<Group, 'slug' | 'programs' | 'dimensions' | 'collaborations' | 'infrastructures' | 'freshness' | 'modified_at'> & Partial<Group>): Group {
  return {
    slug: g.id,
    programs: [],
    dimensions: {},
    collaborations: [],
    infrastructures: [],
    freshness: 'verified',
    modified_at: '2026-09-30T00:00:00Z',
    ...g,
  }
}

const freeText = (id: string, slot_key: string, text: string, why: string, placeholder: string): ClarifyQuestion => ({
  id,
  slot_key,
  kind: 'free_text',
  text,
  why,
  placeholder,
  allow_skip: true,
})

const grant = (
  id: string,
  agency: GrantMatch['call']['agency'],
  provider: string,
  name: string,
  deadline: string,
  fit: number,
  template_id: string,
): GrantMatch => ({
  call: { id, agency, provider, name, deadline, status: 'open', rules_id: template_id, template_id, url: DEMO_URL },
  fit,
  checks: [],
})

const tech = (id: string, name: string, institution: string, node: string, infrastructure?: string, group_id?: string): TechResource => ({
  id,
  name,
  where: { institution, node, infrastructure, group_id },
  access: 'Spolupráce se skupinou nebo služba core facility',
  citations: [],
})

// ---------------------------------------------------------------------------------------------
// Oncology — the pitch scenario (ARCHITECTURE §15: Šedův dotaz)
// ---------------------------------------------------------------------------------------------

export const ONCOLOGY: Scenario = {
  key: 'oncology',
  title: 'Nádorové mikroprostředí mozkových metastáz',
  summary:
    'Tým pro výzkum vztahů v nádorovém mikroprostředí s modelem mozkových metastáz a prostorovou transkriptomikou pro společný grant.',
  match: /mikroprost|metast|transkript|onko|nádor|nador|tumou?r/i,
  reason: 'V zadání chybí technologie, požadavky na tým a informace o předchozím podání.',
  questions: [
    freeText(
      'q-tech',
      'existing_tech',
      'Máte už technologii nebo metodu, jak to chcete řešit?',
      'Podle toho hledám skupiny, které technologii mají, nebo ji doplní.',
      'např. Máme vlastní kohortu vzorků, prostorovou transkriptomiku zatím nemáme…',
    ),
    freeText(
      'q-team',
      'team_requirements',
      'Koho v týmu nutně potřebujete?',
      'Pokud se nikdo nehodí, místo nechám prázdné. Tým nevybírám za každou cenu.',
      'např. Klinika s pacienty s mozkovými metastázami a bioinformatika, ideálně z Prahy…',
    ),
    freeText(
      'q-prior',
      'prior_submissions',
      'Podávali jste už na tento projekt grant?',
      'Poskytovatelé hlídají souběhy a opakovaná podání.',
      'např. Zatím ne, cílíme na AZV v lednu…',
    ),
  ],
  confirm: {
    id: 'q-confirm',
    slot_key: 'grant',
    kind: 'yes_no',
    text: 'Rozumím, že jde o společný grant AZV s termínem v lednu 2027. Sedí to?',
    why: 'Podle výzvy hlídám podmínky týmu (Ph.D. řešitele, počet institucí, souběhy).',
    options: [
      { id: 'yes', label: 'Ano' },
      { id: 'no', label: 'Ne, jiná výzva' },
    ],
    impact_preview: { before: 65, after_estimate: 11 },
    allow_skip: true,
  },
  groups: [
    group({ id: 'o1', lab_name: 'Neuroonkologická skupina', pi_name: 'doc. MUDr. Jana Veselá, Ph.D.', node: 'Praha', institution: 'FN Motol', department: 'Neurochirurgická klinika 2. LF UK', size: 12, email: 'demo.vesela@example.org', tags: ['Mozkové metastázy', 'Neurochirurgie', 'Kohorta pacientů'] }),
    group({ id: 'o2', lab_name: 'Laboratoř nádorového mikroprostředí', pi_name: 'RNDr. Petr Dvořák, Ph.D.', node: 'Praha', institution: 'ÚMG AV ČR', department: 'Oddělení buněčné biologie', size: 9, email: 'demo.dvorak@example.org', tags: ['Nádorové mikroprostředí', 'Astrocyty', 'Ko-kultury'] }),
    group({ id: 'o3', lab_name: 'Skupina prostorové omiky', pi_name: 'Mgr. Tereza Horáková, Ph.D.', node: 'Brno', institution: 'CEITEC MU', department: 'Core facility Genomika', size: 7, email: 'demo.horakova@example.org', tags: ['Prostorová transkriptomika', 'Single-cell', 'Visium'] }),
    group({ id: 'o4', lab_name: 'Laboratoř preklinických modelů', pi_name: 'doc. RNDr. Martin Kučera, Ph.D.', node: 'Praha', institution: 'BIOCEV', department: 'Vestec', size: 8, email: 'demo.kucera@example.org', tags: ['Myší modely', 'Intrakraniální metastázy', 'In vivo imaging'] }),
    group({ id: 'o5', lab_name: 'Bioinformatická skupina', pi_name: 'Ing. Lucie Marková, Ph.D.', node: 'Brno', institution: 'MOÚ', department: 'RECAMO', size: 6, email: 'demo.markova@example.org', tags: ['Bioinformatika', 'Integrace omik', 'Statistika'] }),
    group({ id: 'o6', lab_name: 'Neuropatologická laboratoř', pi_name: 'MUDr. Ondřej Šimek, Ph.D.', node: 'Olomouc', institution: 'LF UP', department: 'Ústav klinické a molekulární patologie', size: 10, email: 'demo.simek@example.org', tags: ['Neuropatologie', 'Digitální patologie'] }),
    group({ id: 'o7', lab_name: 'Laboratoř imunoonkologie', pi_name: 'RNDr. Kateřina Benešová, Ph.D.', node: 'Praha', institution: '1. LF UK', department: 'Ústav imunologie', size: 7, email: 'demo.benesova@example.org', tags: ['Imunoprofilování', 'Průtoková cytometrie'] }),
  ],
  why: {
    o1: 'Skupina operuje pacienty s mozkovými metastázami a vede vlastní kohortu s archivními vzorky, tedy klinický materiál, který projektu chybí.',
    o2: 'Laboratoř dlouhodobě studuje interakce nádorových buněk s astrocyty v mozkovém mikroprostředí a má zavedené ko-kultivační modely.',
    o3: 'Core facility provozuje prostorovou transkriptomiku a analyzuje data z nádorových tkání, což je klíčová technologie zadání.',
    o4: 'Skupina má zavedený intrakraniální myší model metastáz, který umožní ověřit nálezy in vivo.',
    o5: 'Bioinformatici integrují prostorová a single-cell data a pokryjí statistiku a validační design.',
    o6: 'Neuropatologie zajistí histologickou anotaci řezů pro prostorovou analýzu.',
    o7: 'Imunoprofilování doplní pohled na imunitní složku mikroprostředí.',
  },
  variants: {
    INTELLIGENCE: {
      summary:
        'Tým s nejsilnějším vědeckým jádrem: dvě laboratoře přímo studují mozkové mikroprostředí, core facility dodá prostorovou transkriptomiku a klinika vlastní kohortu vzorků.',
      members: [
        { group_id: 'o2', role: 'Mikroprostředí', total: 0.94 },
        { group_id: 'o3', role: 'Prostorová transkriptomika', total: 0.92 },
        { group_id: 'o1', role: 'Klinika', total: 0.9 },
        { group_id: 'o4', role: 'Modely metastáz', total: 0.88 },
        { group_id: 'o5', role: 'Bioinformatika', total: 0.85 },
      ],
    },
    GRANT: {
      summary:
        'Tým poskládaný podle podmínek AZV: klinický řešitel s Ph.D., tři instituce bez souběhů a pracoviště s infrastrukturou, kterou výzva hodnotí.',
      members: [
        { group_id: 'o1', role: 'Klinika · řešitel', total: 0.93 },
        { group_id: 'o2', role: 'Mikroprostředí', total: 0.9 },
        { group_id: 'o3', role: 'Prostorová transkriptomika', total: 0.88 },
        { group_id: 'o6', role: 'Neuropatologie', total: 0.82 },
      ],
    },
    BALANCED: {
      summary:
        'Vyvážený tým: silné vědecké jádro doplněné klinikou a imunoprofilováním, s rozumnou šancí v AZV i GA ČR.',
      members: [
        { group_id: 'o1', role: 'Klinika', total: 0.91 },
        { group_id: 'o2', role: 'Mikroprostředí', total: 0.92 },
        { group_id: 'o3', role: 'Prostorová transkriptomika', total: 0.9 },
        { group_id: 'o4', role: 'Modely metastáz', total: 0.86 },
        { group_id: 'o7', role: 'Imunoprofilování', total: 0.79 },
      ],
    },
  },
  bench: [
    { group_id: 'o6', role: 'Neuropatologie', total: 0.82 },
    { group_id: 'o7', role: 'Imunoprofilování', total: 0.79 },
    { group_id: 'o5', role: 'Bioinformatika', total: 0.85 },
    { group_id: 'o4', role: 'Modely metastáz', total: 0.86 },
  ],
  tech: [
    tech('t1', 'Prostorová transkriptomika (10x Visium)', 'CEITEC MU · Core facility Genomika', 'Brno', 'CEITEC', 'o3'),
    tech('t2', 'Intrakraniální myší model metastáz', 'BIOCEV · Laboratoř preklinických modelů', 'Vestec', undefined, 'o4'),
    tech('t3', 'Kohorta a archivní vzorky mozkových metastáz', 'FN Motol · Neurochirurgická klinika', 'Praha', undefined, 'o1'),
    tech('t4', 'Single-cell RNA-seq', 'ÚMG AV ČR · Genomika', 'Praha', undefined, 'o2'),
  ],
  grants: [
    grant('azv-2027', 'AZV', 'AZV ČR', 'Program na podporu zdravotnického aplikovaného výzkumu', '2027-01-30', 0.94, 'azv-standard'),
    grant('gacr-2027', 'GACR', 'GA ČR', 'Standardní projekty', '2027-04-07', 0.91, 'gacr-standard'),
    grant('he-2027', 'HORIZON', 'Evropská komise', 'Horizon Europe – Cluster 1 Health', '2027-04-16', 0.78, 'horizon-ria-ia'),
    grant('tacr-2027', 'TACR', 'TA ČR', 'Program SIGMA – DC3', '2027-05-14', 0.72, 'tacr-sigma'),
  ],
  sections: {
    title: 'Prostorová mapa mikroprostředí mozkových metastáz: od kohorty pacientů k modelu in vivo',
    abstract:
      'Mozkové metastázy postihují až čtvrtinu pacientů se solidními nádory a jejich léčba zůstává omezená. Projekt zmapuje interakce nádorových buněk s buňkami mozkového mikroprostředí pomocí prostorové transkriptomiky na vzorcích pacientů a ověří klíčové interakce v intrakraniálním myším modelu.',
    aims:
      '1. Sestavit prostorový atlas mikroprostředí mozkových metastáz z archivních vzorků.\n2. Identifikovat interakce nádor–astrocyt spojené s progresí.\n3. Ověřit vybrané interakce v modelu in vivo.',
    methods:
      'Vzorky z kohorty pacientů budou analyzovány prostorovou transkriptomikou. Data budou integrována se single-cell profily. Vybrané interakce budou ověřeny v intrakraniálním myším modelu.',
  },
}

// ---------------------------------------------------------------------------------------------
// Parkinson — content from the approved prototype v5
// ---------------------------------------------------------------------------------------------

export const PARKINSON: Scenario = {
  key: 'parkinson',
  title: 'Detekce Parkinsonovy nemoci z hlasu',
  summary: 'Model, který z 30sekundové hlasové nahrávky odhalí rané stadium Parkinsonovy nemoci.',
  match: /parkinson|hlas|řeč|rec/i,
  reason: 'V zadání chybí technologie a požadavky na lidi.',
  questions: [
    freeText(
      'q-tech',
      'existing_tech',
      'Máte už technologii nebo metodu, jak to chcete řešit?',
      'Podle toho hledám skupiny, které technologii mají, nebo ji doplní.',
      'např. Plánuji self-supervised řečové modely, máme 400 nahrávek z pilotu…',
    ),
    freeText(
      'q-team',
      'team_requirements',
      'Koho v týmu nutně potřebujete?',
      'Pokud se nikdo nehodí, místo nechám prázdné. Tým nevybírám za každou cenu.',
      'např. Potřebuji klinického partnera a statistika, ideálně z Prahy…',
    ),
    freeText(
      'q-prior',
      'prior_submissions',
      'Podávali jste už na tento projekt grant?',
      'Poskytovatelé hlídají souběhy a opakovaná podání.',
      'např. Zatím ne, cílíme na AZV v lednu…',
    ),
  ],
  confirm: {
    id: 'q-confirm',
    slot_key: 'grant',
    kind: 'yes_no',
    text: 'Rozumím, že hledáte tým i financování a nejbližší vhodná výzva je AZV. Sedí to?',
    why: 'Podle výzvy hlídám podmínky týmu.',
    options: [
      { id: 'yes', label: 'Ano' },
      { id: 'no', label: 'Ne, jiná výzva' },
    ],
    impact_preview: { before: 65, after_estimate: 9 },
    allow_skip: true,
  },
  groups: [
    group({ id: 'p1', lab_name: 'Laboratoř biomedicínských signálů', pi_name: 'doc. Ing. Tereza Malá, Ph.D.', node: 'Praha', institution: 'ČVUT FEL', department: 'Katedra kybernetiky', size: 9, email: 'demo.mala@example.org', tags: ['ML pro biosignály', 'Self-supervised learning', 'PyTorch'] }),
    group({ id: 'p2', lab_name: 'Speech@FIT', pi_name: 'Ing. Ondřej Kříž, Ph.D.', node: 'Brno', institution: 'VUT FIT', department: 'Speech@FIT', size: 11, email: 'demo.kriz@example.org', tags: ['Řečové modely', 'Rozpoznávání řeči'] }),
    group({ id: 'p3', lab_name: 'Skupina prozodie a patologické řeči', pi_name: 'Mgr. Lucie Benešová, Ph.D.', node: 'Praha', institution: 'FF UK', department: 'Fonetický ústav', size: 5, email: 'demo.l.benesova@example.org', tags: ['Fonetika', 'Prozodie'] }),
    group({ id: 'p4', lab_name: 'Centrum extrapyramidových onemocnění', pi_name: 'MUDr. Jan Horák, Ph.D.', node: 'Praha', institution: '1. LF UK', department: 'Neurologická klinika VFN', size: 14, email: 'demo.horak@example.org', tags: ['Klinika', 'Parkinsonova nemoc'] }),
    group({ id: 'p5', lab_name: 'Skupina klinické biostatistiky', pi_name: 'RNDr. Martin Svoboda, Ph.D.', node: 'Brno', institution: 'MU', department: 'RECETOX, Biostatistika', size: 7, email: 'demo.svoboda@example.org', tags: ['Biostatistika', 'Validační design'] }),
    group({ id: 'p6', lab_name: 'Laboratoř neurozobrazování', pi_name: 'MUDr. Eva Nováková, Ph.D.', node: 'Olomouc', institution: 'LF UP', department: 'Neurologická klinika', size: 8, email: 'demo.novakova@example.org', tags: ['Neurozobrazování', 'Prodromální fáze'] }),
  ],
  why: {
    p1: 'Vedla projekt detekce dysartrie z řeči. Publikace skupiny se přímo týkají akustických biomarkerů neurodegenerace.',
    p2: 'Skupina vyvíjí řečové modely a umí je nasadit i pro mobilní inferenci.',
    p3: 'Fonetický ústav má zvukotěsnou komoru a zkušenosti s analýzou patologické řeči.',
    p4: 'Klinika zajistí nábor pacientů s Parkinsonovou nemocí a kontrol.',
    p5: 'Biostatistici navrhnou validační design a velikost souboru.',
    p6: 'Neurozobrazování umožní ověřit prodromální fázi nezávislou metodou.',
  },
  variants: {
    INTELLIGENCE: {
      summary:
        'Konsorcium s nejsilnějším technickým jádrem: dva týmy přímo publikují o řečových biomarkerech, klinický tým dodá kohortu a statistici validační design.',
      members: [
        { group_id: 'p1', role: 'ML a biosignály', total: 0.94 },
        { group_id: 'p2', role: 'Řečové modely', total: 0.9 },
        { group_id: 'p3', role: 'Fonetika', total: 0.88 },
        { group_id: 'p4', role: 'Klinika', total: 0.91 },
        { group_id: 'p5', role: 'Biostatistika', total: 0.85 },
      ],
    },
    GRANT: {
      summary: 'Tým podle podmínek AZV: klinický řešitel, tři instituce a jasně rozdělené role bez souběhů.',
      members: [
        { group_id: 'p4', role: 'Klinika · řešitel', total: 0.92 },
        { group_id: 'p1', role: 'ML a biosignály', total: 0.91 },
        { group_id: 'p5', role: 'Biostatistika', total: 0.86 },
        { group_id: 'p3', role: 'Fonetika', total: 0.84 },
      ],
    },
    BALANCED: {
      summary: 'Vyvážený tým: technické jádro, klinika a nezávislé ověření prodromální fáze.',
      members: [
        { group_id: 'p1', role: 'ML a biosignály', total: 0.93 },
        { group_id: 'p4', role: 'Klinika', total: 0.9 },
        { group_id: 'p2', role: 'Řečové modely', total: 0.88 },
        { group_id: 'p6', role: 'Neurozobrazování', total: 0.8 },
        { group_id: 'p5', role: 'Biostatistika', total: 0.84 },
      ],
    },
  },
  bench: [
    { group_id: 'p6', role: 'Neurozobrazování', total: 0.8 },
    { group_id: 'p2', role: 'Řečové modely', total: 0.9 },
    { group_id: 'p3', role: 'Fonetika', total: 0.88 },
  ],
  tech: [
    tech('t1', 'Self-supervised modely (wav2vec 2.0, HuBERT)', 'e-INFRA CZ · MetaCentrum, GPU A100', 'Praha', 'e-INFRA CZ'),
    tech('t2', 'Klasické příznaky (Praat, openSMILE)', 'FF UK · Fonetický ústav, zvukotěsná komora', 'Praha', undefined, 'p3'),
    tech('t3', 'Sběr nahrávek od pacientů a kontrol', 'Neurologická klinika 1. LF UK a VFN', 'Praha', undefined, 'p4'),
    tech('t4', 'Mobilní inference (ONNX, Core ML)', 'VUT FIT · Speech@FIT', 'Brno', undefined, 'p2'),
  ],
  grants: [
    grant('azv-2027', 'AZV', 'AZV ČR', 'Program na podporu zdravotnického aplikovaného výzkumu', '2027-01-30', 0.94, 'azv-standard'),
    grant('gacr-2027', 'GACR', 'GA ČR', 'Standardní projekty', '2027-04-07', 0.91, 'gacr-standard'),
    grant('he-2027', 'HORIZON', 'Evropská komise', 'Horizon Europe – Cluster 1 Health', '2027-04-16', 0.78, 'horizon-ria-ia'),
    grant('tacr-2027', 'TACR', 'TA ČR', 'Program SIGMA – DC3', '2027-05-14', 0.72, 'tacr-sigma'),
  ],
  sections: {
    title: 'Hlas jako biomarker: včasná detekce Parkinsonovy nemoci pomocí self-supervised řečových modelů',
    abstract:
      'Parkinsonova nemoc je diagnostikována v průměru 5–10 let po vzniku prvních neurologických změn. Změny hlasu patří mezi nejčasnější projevy. Projekt vyvine a klinicky ověří model, který z 30sekundové nahrávky odhalí prodromální stadium nemoci.',
    aims:
      '1. Sestavit referenční databázi nahrávek pacientů s RBD, PD a kontrol.\n2. Vyvinout model s AUC ≥ 0,85 pro prodromální fázi.\n3. Ověřit model v klinické praxi.',
    methods:
      'Nahrávky budou pořízeny podle standardizovaného protokolu. Model dosáhne senzitivity 90 % na pilotních datech (n = 42). Reprezentace z modelu HuBERT doplníme klasickými akustickými příznaky.',
  },
}

export const SCENARIOS = [ONCOLOGY, PARKINSON] as const

export function scenarioFor(prompt: string): Scenario {
  return SCENARIOS.find((s) => s.match.test(prompt)) ?? ONCOLOGY
}

export function scenarioByKey(key: Scenario['key']): Scenario {
  return key === 'parkinson' ? PARKINSON : ONCOLOGY
}

/** Build a Member with an explanation whose claims cite demo sources. */
export function buildMember(s: Scenario, m: ScenarioMember): Member {
  const g = s.groups.find((x) => x.id === m.group_id)
  const cite = `c-${m.group_id}`
  const explanation: Explanation = {
    why: [{ text: s.why[m.group_id] ?? '', citation_ids: [cite] }],
    benefit: [{ text: `Do týmu přináší: ${(g?.tags ?? []).join(', ')}.`, citation_ids: [cite] }],
    gap: [],
    first_step: [
      { text: `Krátká schůzka s vedoucím skupiny a sdílení zadání projektu (${g?.pi_name ?? ''}).`, citation_ids: [cite] },
    ],
  }
  return {
    group_id: m.group_id,
    role: m.role,
    covers: g?.tags ?? [],
    scores: [],
    total: m.total,
    explanation,
    existing_collab_with: [],
    warnings: [],
  }
}

export const EXAMPLE_PROMPTS = [
  'Chceme postavit tým k řešení vztahů v nádorovém mikroprostředí, ideálně s modelem mozkových metastáz a prostorovou transkriptomikou pro společný grant.',
  'Chci vyvinout model, který z 30sekundové hlasové nahrávky odhalí rané stadium Parkinsonovy nemoci. Potřebuji tým a financování.',
] as const
