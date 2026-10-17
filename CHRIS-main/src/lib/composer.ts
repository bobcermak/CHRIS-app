import type { CreateProjectInput } from './data'

/** Structured context collected by the "+" menu, sent along with the prompt. */
export type ComposerContext = Pick<CreateProjectInput, 'links' | 'call' | 'own_group' | 'mode'>

export const EMPTY_CONTEXT: ComposerContext = { links: [], call: null, own_group: null, mode: 'quick' }

export const PROMPT_TEMPLATES: { title: string; text: string }[] = [
  {
    title: 'Tým pro společný grant',
    text: 'Chceme postavit tým k řešení vztahů v nádorovém mikroprostředí, ideálně s modelem mozkových metastáz a prostorovou transkriptomikou pro společný grant.',
  },
  {
    title: 'Partner s technologií',
    text: 'Hledáme pracoviště s prostorovou transkriptomikou a zkušeností s analýzou nádorových tkání, které by se zapojilo do našeho projektu.',
  },
  {
    title: 'Klinická kohorta',
    text: 'Potřebujeme klinického partnera s kohortou pacientů s mozkovými metastázami a biobankou vzorků pro validaci našich laboratorních výsledků.',
  },
]

const DOI = /^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)?(10\.\d{4,9}\/\S+)$/i
const URL_RE = /^https?:\/\/\S+\.\S+/i

/** Parse "Přidat odkaz" input: a DOI (bare, doi:, doi.org) or an http(s) URL. */
export function parseLink(raw: string): ComposerContext['links'][number] | string {
  const v = raw.trim()
  const doi = DOI.exec(v)
  if (doi) return { kind: 'doi', value: doi[1] }
  if (URL_RE.test(v)) return { kind: 'url', value: v }
  return 'Zadejte celou adresu (https://…) nebo DOI ve tvaru 10.xxxx/…'
}
