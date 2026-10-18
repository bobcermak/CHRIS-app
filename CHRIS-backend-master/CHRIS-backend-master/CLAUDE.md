# Rakathon 2026 — NÚVR Research Matchmaker

## Výzva
NÚVR Research Matchmaker. Vědec zapíše svůj výzkumný nápad (hypotézu / zájem) a systém mu doporučí:
1. **Tým** (spolupracovníky z NÚVR databáze)
2. **Technologie** (způsob, jak hypotézu řešit, a kde ji mají k dispozici)
3. **Granty** (zdroj financování)

Po prvotním doporučení může vědec tým upravit. UX úpravy týmu: uživatel zaškrtne vědce, které chce **ponechat** (pinned), ostatní se při přepočtu nahradí novými návrhy.

### Vstup od vědce
Krátký volný prompt → AI se strukturovaně doptá přes formulář (follow-up otázky).

## Zdroje dat
- **Lidé:** databáze NÚVR
- **Granty:** zdroj zatím nevybrán
- **Technologie:** zdroj zatím nevybrán (technologie = způsob + fyzická dostupnost pracoviště)

## Matchmaking — oboustranný výběr
Technologie i lidé se navrhují **současně**. Vědec může kliknout na kteroukoli stranu — klik zúží druhou. (Facet filtering.)

## Dvě varianty návrhu týmu
- **INTELLIGENCE-FIRST** — tým primárně dle expertízy, granty se hledají až poté. **Hlavní varianta na hackathonu.**
- **GRANT-FIRST** — najde nejvhodnější grant, podle jeho pravidel sestaví tým. Na hackathonu **naznačeno jako future work** — ukázat vizi, ne doperfekcionizovat.

## Datové zdroje (potvrzené)

### NÚVR — WordPress REST API (veřejné)
- `GET https://www.nuvr.cz/wp-json/wp/v2/vedec?per_page=100` — **seznam skupin** (⚠ `vedec` = výzkumná **skupina**, ne jednotlivec)
- `GET /wp-json/wp/v2/vedec/{id}` — detail skupiny
- `GET /wp-json/wp/v2/uzel` — uzly Praha/Brno/Olomouc
- `GET /wp-json/wp/v2/faktulty_ustavy` — pracoviště
- `GET /wp-json/wp/v2/vyzkumny-program` — VP1–VP5
- `GET /wp-json/wp/v2/pages` — stránky (katalog technologií, spolupráce)
- Fallback scrape: `https://www.nuvr.cz/vedci/`, `/vedec/{slug}/`, EN verze `/en/research-groups/`

### Publikace (per autor/skupina)
- OpenAlex: `https://api.openalex.org/works/doi:{DOI}`, `/authors?search={jméno}`, `/works?filter=author.id:{id}`
- Europe PMC: `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query={}&format=json`
- PubMed eutils: `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term={}`
- ORCID: `https://pub.orcid.org/v3.0/{orcid}/works`

### Granty
- EU CORDIS: `https://cordis.europa.eu/search?q={}`
- EU Funding & Tenders: `https://api.tech.ec.europa.eu/search-api/prod/rest/search` (otevřené výzvy)
- **ISVAVAI (ČR)**: `https://www.isvavai.cz/` — CEP, AZV/GAČR/TAČR, **má open data dumps** na `isvavai.cz/open-data` ← zlato
- AZV: `https://www.azvcr.cz/` (scrape)

### Infrastruktury / technologie (biomed)
- BBMRI `https://www.bbmri.cz/`
- EATRIS `https://www.eatris.cz/`
- CZECRIN `https://www.czecrin.cz/`
- Czech BioImaging `https://www.czech-bioimaging.cz/`

### Důležité implikace (po průzkumu API 2026-10-16)
- **`vedec` = výzkumná skupina pojmenovaná po svém vedoucím** (potvrzeno: `/vedec/jiri-homola/` → skupina "Optické biosenzory", PI Jiří Homola).
- **REST API vrací jen metadata** (title, faktulty_ustavy, uzel, vyzkumny-program jako FK IDs). Pole `content` a `acf` jsou prázdné.
- **Všechen bohatý obsah je v HTML** `/vedec/{slug}/` pod nadpisy: ZAMĚŘENÍ A CÍLE VÝZKUMU, VYBRANÉ PUBLIKACE, EXPERTIZA A TECHNOLOGIE, SPOLUPRÁCE V NÚVR, ZAPOJENÍ DO INFRASTRUKTUR + Mise + Vize.
- **Scraper musí tahat HTML** (BeautifulSoup) a parsovat sekce. REST API použít jen pro seznam slugů + resolvování FK (uzel, pracoviště, VP) na jména.
- **Jednotka týmu = skupina**, ne osoba. UI = karta skupiny s PI, afiliací, VP, misí.
- **Granty = strukturovaná data existují** (isvavai open-data) → GRANT-FIRST se dá udělat víc než jen stub.

## Tech stack
- **Backend:** Python + FastAPI
  - **Package manager:** `uv`
  - **Struktura:** modulární od začátku (`app/routers`, `app/services`, `app/schemas`, `app/models`)
  - **LLM provider:** neurčeno — bude za abstrakcí (`LLMClient` interface + mock impl)
  - **Storage:** neurčeno — leading nápad: stáhnout NÚVR databázi lokálně (desítky–stovky vědců), udělat vektorový search (embeddings in-memory nebo sqlite-vec)
- **Frontend:** React

## Poznámka pro Claude
Vše výše jsou nápady, ne finální rozhodnutí. Uživatel vítá kritiku, protinávrhy a zpětnou vazbu. Nic není nedotknutelné — pokud vidíš lepší cestu, řekni to.
