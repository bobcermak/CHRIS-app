import type { Strategy } from './data'

export const STRATEGIES: readonly Strategy[] = ['INTELLIGENCE', 'GRANT']

export const STRATEGY_LABEL: Record<Strategy, string> = {
  INTELLIGENCE: 'Intelligence-first',
  GRANT: 'Grant-first',
  BALANCED: 'Balanced',
}

export const STRATEGY_HINT: Record<Strategy, string> = {
  INTELLIGENCE: 'Nejvyšší odborná shoda',
  GRANT: 'Sestaveno podle podmínek výzvy',
  BALANCED: 'Vyvážená věda a grant',
}
