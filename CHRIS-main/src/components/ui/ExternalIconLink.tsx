import { ArrowUpRightIcon } from '@phosphor-icons/react'
import { cn } from '../../lib/utils/cn'

/**
 * Small round link with a diagonal arrow — opens an external page (a grant's website) in a new
 * tab. Renders nothing without a URL, so callers can pass whatever the data has.
 */
export function ExternalIconLink({ href, label, className }: { href?: string; label: string; className?: string }) {
  if (!href) return null
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label} (otevře se v novém okně)`}
      title={label}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'group/ext relative z-10 inline-grid size-7 shrink-0 place-items-center rounded-full border border-line bg-card text-text-muted transition-colors duration-(--dur-hover) ease-(--ease-out) hover:border-orange-500 hover:bg-orange-50 hover:text-orange-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500',
        className,
      )}
    >
      <ArrowUpRightIcon
        size={13}
        weight="bold"
        aria-hidden
        className="transition-transform duration-(--dur-hover) ease-(--ease-out) group-hover/ext:translate-x-px group-hover/ext:-translate-y-px"
      />
    </a>
  )
}

/**
 * The same arrow badge, decorative, for when the whole surrounding card is the link (no link
 * inside a link). It lights up on hover/focus of the nearest `group/link` ancestor.
 */
export function ExternalArrow({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-grid size-7 shrink-0 place-items-center rounded-full border border-line bg-card text-text-muted transition-colors duration-(--dur-hover) ease-(--ease-out) group-hover/link:border-orange-500 group-hover/link:bg-orange-50 group-hover/link:text-orange-ink group-focus-visible/link:border-orange-500 group-focus-visible/link:text-orange-ink',
        className,
      )}
    >
      <ArrowUpRightIcon
        size={13}
        weight="bold"
        className="transition-transform duration-(--dur-hover) ease-(--ease-out) group-hover/link:translate-x-px group-hover/link:-translate-y-px"
      />
    </span>
  )
}
