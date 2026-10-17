/**
 * Site facts used on legal pages and in meta. Fields marked TODO must be filled in by the team
 * before a public deploy (see README → Před nasazením).
 */
export const site = {
  name: 'CHRIS',
  fullName: 'Collaborative Hub for Research Intelligence & Synergy',
  team: 'tým Remiho Klubík',
  event: 'Rakathon 2026, výzva NÚVR Research Matchmaker',
  /** Contact of the data controller and security contact. */
  contactEmail: 'director@nuvr.cz',
  /** TODO(team): final production URL. */
  url: '',
  updated: '16. 10. 2026',
} as const

export const AI_NOTICE =
  'Doporučení, vysvětlení a texty generuje umělá inteligence a mohou obsahovat chyby. Každé tvrzení má odkaz na zdroj, ověřte ho.'

export const PROTOTYPE_NOTICE =
  'Prototyp z hackathonu. Není to zdravotnický prostředek ani klinicky ověřený nástroj.'
