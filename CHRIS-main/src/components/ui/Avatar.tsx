import { useState } from 'react'
import { initials } from '../../lib/utils/format'
import { cn } from '../../lib/utils/cn'

interface AvatarProps {
  name: string
  /** Portrait URL; initials are shown when missing or when it fails to load. */
  src?: string
  size?: 'sm' | 'md' | 'lg'
  tone?: 'light' | 'dark'
  className?: string
}

const SIZE = { sm: 'size-8 text-meta', md: 'size-11 text-small', lg: 'size-16 text-body' }

/** Leader portrait, falling back to initials. Decorative — the name is always shown next to it. */
export function Avatar({ name, src, size = 'md', tone = 'light', className }: AvatarProps) {
  const [failed, setFailed] = useState<string | null>(null)
  const showPhoto = Boolean(src) && failed !== src

  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-medium tracking-wide select-none',
        tone === 'dark' ? 'bg-charcoal-900 text-white' : 'bg-inset text-charcoal-700',
        SIZE[size],
        className,
      )}
    >
      {showPhoto ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(src ?? null)}
          className="size-full object-cover object-top"
        />
      ) : (
        initials(name)
      )}
    </span>
  )
}
