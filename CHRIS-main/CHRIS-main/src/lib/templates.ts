import type { ApplicationTemplate, TemplateStatus } from './data'

/** Typographic status labels (§9.5 UI) — shown at the title and on every section. */
export function templateStatusLabel(t: Pick<ApplicationTemplate, 'status' | 'based_on'>, library?: ApplicationTemplate[]): string {
  switch (t.status) {
    case 'verified':
      return 'Ověřená šablona'
    case 'derived': {
      const base = library?.find((x) => x.id === t.based_on)
      return `Odvozená z ${base?.scheme ?? 'známé šablony'}`
    }
    case 'extracted':
      return 'Z dokumentace, k potvrzení'
    case 'generic':
      return 'Obecná osnova'
  }
}

export const STATUS_SHORT: Record<TemplateStatus, string> = {
  verified: 'Ověřená',
  derived: 'Odvozená',
  extracted: 'Z dokumentace',
  generic: 'Obecná',
}

export const AGENCY_LABEL: Record<ApplicationTemplate['agency'], string> = {
  AZV: 'AZV ČR',
  GACR: 'GA ČR',
  TACR: 'TA ČR',
  HORIZON: 'Evropská komise',
  OTHER: 'Jiný poskytovatel',
}

export const AI_DRAFT_NOTICE = 'AI-assisted draft — oficiální podání pouze v ISVP/GRIS.'
export const UNVERIFIED_NOTICE = 'Šablona nebyla ověřena proti oficiální dokumentaci výzvy.'
