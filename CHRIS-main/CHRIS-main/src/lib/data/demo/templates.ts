import type { ApplicationTemplate, GrantCall, TemplateCitation, TemplateResolveInput, TemplateSection } from '../contract'

// Demo template library (ARCHITECTURE §9.5). Real templates come from the backend
// (`data/snapshots/templates/*.yaml`) with a citation for every section and limit.

const FETCHED = '2026-10-01T00:00:00Z'

const s = (
  key: string,
  title: string,
  hint: string,
  max_chars?: number,
  required = true,
): TemplateSection => ({
  key,
  title,
  required,
  hint,
  limits: max_chars ? { max_chars } : undefined,
  confirmed: true,
  citation_ids: [],
})

const AZV_SECTIONS: TemplateSection[] = [
  s('title', 'Název projektu', 'Max. 250 znaků, česky i anglicky.', 250),
  s('abstract', 'Abstrakt', 'Shrnutí cíle, metod a očekávaného přínosu.', 2000),
  s('aims', 'Cíle a hypotéza', 'Obecný cíl, dílčí cíle a testovaná hypotéza (osnova d).', 2000),
  s('state', 'Stav poznání', 'Úvod a současný stav poznání (osnova a).', 6000),
  s('methods', 'Metodika a design', 'Experimentální design včetně statistického zdůvodnění velikosti souboru (osnova e, f).', 8000),
  s('team', 'Řešitelský tým', 'Spolupráce a zdůvodnění účasti spolunavrhovatelů (osnova i, k).', 4000),
  s('timeline', 'Harmonogram', 'Etapy a milníky po letech (osnova g).', 3000),
  s('outputs', 'Očekávané výsledky', 'Typy výsledků podle podmínek výzvy (osnova h).', 3000),
  s('risks', 'Analýza rizik', 'Rizika a jejich zmírnění (osnova l).', 2500),
  s('dmp', 'Data management plan', 'Výzkumná data a FAIR principy (osnova m).', 3000),
]

const GACR_SECTIONS: TemplateSection[] = [
  s('title', 'Název projektu', 'Max. 250 znaků.', 250),
  s('abstract', 'Abstrakt', 'Stručný popis projektu.', 2000),
  s('state', 'Současný stav poznání', 'Kontext a vymezení vůči literatuře.', 6000),
  s('aims', 'Cíle projektu', 'Vědecké cíle a hypotézy.', 2000),
  s('methods', 'Metody', 'Metodický přístup a proveditelnost.', 8000),
  s('team', 'Řešitelský tým', 'Kvalifikace a role členů.', 4000),
  s('outputs', 'Očekávané výsledky', 'Publikační a další výstupy.', 3000),
]

const HORIZON_SECTIONS: TemplateSection[] = [
  s('excellence', 'Excellence', 'Objectives, ambition, methodology.', 30000),
  s('impact', 'Impact', 'Pathways to impact, dissemination and exploitation.', 20000),
  s('implementation', 'Implementation', 'Work plan, resources, consortium.', 25000),
]

const TACR_SECTIONS: TemplateSection[] = [
  s('title', 'Název projektu', 'Max. 250 znaků.', 250),
  s('abstract', 'Anotace', 'Stručný popis projektu.', 2000),
  s('aims', 'Cíle projektu', 'Měřitelné cíle.', 2000),
  s('methods', 'Způsob řešení', 'Metody a postup řešení.', 8000),
  s('team', 'Řešitelský tým', 'Role a kapacity.', 4000),
  s('outputs', 'Výsledky a jejich uplatnění', 'Výsledky podle číselníku poskytovatele.', 3000),
]

function template(
  id: string,
  agency: GrantCall['agency'],
  scheme: string,
  language: 'cs' | 'en',
  sections: TemplateSection[],
  document_limits?: ApplicationTemplate['document_limits'],
): ApplicationTemplate {
  return {
    id,
    status: 'verified',
    agency,
    scheme,
    version: '2026',
    language,
    sections,
    document_limits,
    rules_id: id,
    source_url: 'https://www.nuvr.cz/',
    fetched_at: FETCHED,
    unknown: [],
  }
}

export const TEMPLATE_LIBRARY: ApplicationTemplate[] = [
  template('azv-standard', 'AZV', 'AZV ČR · standardní projekt', 'en', AZV_SECTIONS, { max_pages: 10, font_pt: 11, line_spacing: 1, max_mb: 3 }),
  template('azv-junior', 'AZV', 'AZV ČR · junior projekt', 'en', AZV_SECTIONS, { max_pages: 10, font_pt: 11, line_spacing: 1, max_mb: 3 }),
  template('gacr-standard', 'GACR', 'GA ČR · standardní projekt', 'en', GACR_SECTIONS),
  template('tacr-sigma', 'TACR', 'TA ČR · SIGMA', 'cs', TACR_SECTIONS),
  template('horizon-ria-ia', 'HORIZON', 'Horizon Europe · RIA/IA Part B', 'en', HORIZON_SECTIONS, { max_pages: 45 }),
]

export const GENERIC_SECTIONS: TemplateSection[] = [
  ['state', 'Stav poznání'],
  ['aims', 'Cíle a hypotéza'],
  ['methods', 'Metodika'],
  ['timeline', 'Harmonogram'],
  ['team', 'Tým a spolupráce'],
  ['infrastructure', 'Infrastruktura'],
  ['risks', 'Rizika'],
  ['budget', 'Rozpočet'],
  ['outputs', 'Dopad a výsledky'],
  ['dmp', 'Data management plan'],
  ['references', 'Literatura'],
].map(([key, title]) => ({ key, title, required: true, hint: 'Ověřte, zda výzva tuto sekci vyžaduje.', confirmed: false, citation_ids: [] }))

/** Fictional call documentation of the demo: an uploaded file reads as this one. */
function extractedDemoTemplate(fileName: string): ApplicationTemplate {
  const cite = (page: number, snippet: string): TemplateCitation => ({
    id: `d1-p${page}`,
    label: `${fileName}, str. ${page}`,
    url: '',
    page,
    snippet,
  })
  const citations = [
    cite(3, 'Popis projektu v rozsahu max. 8 stran A4, písmo 11 pt, řádkování 1.'),
    cite(4, 'Popis projektu obsahuje: cíle, metodiku, harmonogram, řešitelský tým a očekávané výsledky.'),
  ]
  const section = (key: string, title: string, hint: string, max_chars?: number): TemplateSection => ({
    key,
    title,
    required: true,
    hint,
    limits: max_chars ? { max_chars } : undefined,
    confirmed: false,
    citation_ids: ['d1-p4'],
  })
  return {
    id: `extracted-demo-${Date.now().toString(36)}`,
    status: 'extracted',
    agency: 'OTHER',
    scheme: 'Ukázková výzva 2027 (demo)',
    version: '—',
    language: 'cs',
    sections: [
      section('aims', 'Cíle projektu', 'Obecný a dílčí cíle projektu.', 2000),
      section('methods', 'Metodika', 'Postup řešení a použité metody.'),
      section('timeline', 'Harmonogram', 'Etapy a milníky.'),
      section('team', 'Řešitelský tým', 'Role a kvalifikace členů týmu.'),
      section('outputs', 'Očekávané výsledky', 'Výstupy projektu a jejich přínos.'),
    ],
    document_limits: { max_pages: 8, font_pt: 11, line_spacing: 1 },
    source_url: '',
    fetched_at: new Date().toISOString(),
    unknown: ['Hodnoticí kritéria'],
    citations,
  }
}

/**
 * §9.5 in the demo: an uploaded file is read as the fictional documentation above; a link hinting
 * at AZV / GA ČR gets a derived template; anything else the generic outline.
 */
export function resolveDemoTemplate(input: TemplateResolveInput): ApplicationTemplate {
  if ('file' in input) return extractedDemoTemplate(input.file.name)
  const hint = ('url' in input ? input.url : input.call_id).toLowerCase()
  const base = hint.includes('azv') ? TEMPLATE_LIBRARY[0] : hint.includes('gacr') || hint.includes('gačr') ? TEMPLATE_LIBRARY[2] : null

  if (base) {
    return {
      ...base,
      id: `derived-${base.id}-${Date.now().toString(36)}`,
      status: 'derived',
      scheme: `Odvozeno z: ${base.scheme}`,
      based_on: base.id,
      diff: ['Počet stran Popisu projektu se může lišit.', 'Povinnost DMP ověřte v zadávací dokumentaci.'],
      sections: base.sections.map((x) => ({ ...x, confirmed: false })),
      unknown: ['Maximální počet stran Popisu projektu'],
    }
  }

  return {
    id: `generic-${Date.now().toString(36)}`,
    status: 'generic',
    agency: 'OTHER',
    scheme: 'Obecná osnova',
    version: '—',
    language: 'cs',
    sections: GENERIC_SECTIONS,
    source_url: 'url' in input ? input.url : '',
    warning: 'V dokumentaci jsem nenašel osnovu přihlášky. Nabízím obecnou osnovu.',
    fetched_at: new Date().toISOString(),
    unknown: ['Limity sekcí', 'Hodnoticí kritéria', 'Jazyk přihlášky'],
  }
}
