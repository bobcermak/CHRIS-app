import { cn } from '../../lib/utils/cn'
import { toPercent } from '../../lib/utils/format'
import { CountUp } from './CountUp'

interface PercentProps {
  /** 0..1 */
  value: number
  size?: 'sm' | 'md' | 'xl'
  tone?: 'accent' | 'ink'
  label?: string
  className?: string
}

// md is 24 px on purpose: orange #FF5E1F needs large text (≥ 24 px) to pass AA at 3:1.
const SIZE = { sm: 'text-body', md: 'text-[1.5rem] leading-none', xl: 'text-[4rem] leading-none' }

/** Big Bricolage number with a grey "%" (prototype v5). */
export function Percent({ value, size = 'md', tone = 'accent', label = 'shoda', className }: PercentProps) {
  const pct = toPercent(value)
  return (
    <span className={cn('inline-flex items-baseline font-display font-medium tabular tracking-[-0.03em]', SIZE[size], className)}>
      <span className="sr-only">
        {label} {pct} %
      </span>
      <CountUp value={pct} className={tone === 'accent' ? 'text-orange-500' : 'text-text'} />
      <span aria-hidden className={cn('ml-0.5 text-text-faint', size === 'xl' ? 'text-[0.62em]' : 'text-[0.7em]')}>
        %
      </span>
    </span>
  )
}
