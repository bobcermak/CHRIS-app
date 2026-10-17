import { ArrowUpRightIcon, PlusIcon, type Icon } from '@phosphor-icons/react'
import { Link, type LinkProps } from '@tanstack/react-router'
import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type MouseEvent, type ReactNode, type Ref } from 'react'
import { tw as twMerge } from '../../lib/utils/tw'
import { BUTTON_HEIGHT, BUTTON_SQUARE, type ButtonSize } from './buttonSizes'

/**
 * primary / dark — the charcoal CTA with the arrow (white spill with an orange edge on hover)
 * outline / ghost — neutral · icon — round, icon only · accent — round orange icon (prompt send)
 * copilot — orange text with a leading icon for actions the copilot does for the user
 */
export type ButtonVariant = 'primary' | 'dark' | 'outline' | 'ghost' | 'icon' | 'accent' | 'copilot'

type ButtonSharedProps = {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Accessible name. For text buttons it must contain the visible label (WCAG 2.5.3). */
  ariaLabel: string
  className?: string
  wFull?: boolean
  alignLeft?: boolean
  disabled?: boolean
  noStyle?: boolean
  /** Extra classes applied to the wrapper for custom hover states. */
  hover?: string
  /** Toggle state (row actions, quick replies). Renders aria-pressed and the pressed look. */
  pressed?: boolean
  title?: string
  /** Primary / dark: glyph in the circle instead of the arrow (e.g. plus for "Nový projekt"). */
  circleIcon?: Icon
  children: ReactNode
}

/** Other native attributes (data-*, aria-*, handlers injected by Radix `asChild`) pass through. */
type PassThrough<T> = Omit<T, keyof ButtonSharedProps | 'type' | 'onClick' | 'href'>

type LinkButtonProps = ButtonSharedProps &
  PassThrough<AnchorHTMLAttributes<HTMLAnchorElement>> & {
  href: string
  type?: never
  onClick?: () => void
}

type NativeButtonProps = ButtonSharedProps &
  PassThrough<ButtonHTMLAttributes<HTMLButtonElement>> & {
  href?: never
  type: 'submit' | 'reset' | 'button'
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void
}

export type ButtonProps = LinkButtonProps | NativeButtonProps

const EXTERNAL_HREF = /^(https?:|mailto:|tel:)/i

const T = 'duration-(--dur-button) ease-(--ease-out) motion-reduce:transition-none'

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  // Main CTA is charcoal (white text, AA); on hover the white fill with an orange edge spills out of the arrow.
  primary:
    'relative isolate bg-charcoal-900 text-white group-hover:text-charcoal-900 group-active:text-charcoal-900 group-focus-visible:text-charcoal-900',
  // Hover: the orange trace draws over the light border (no darker border underneath to muddy it)
  dark: 'relative isolate bg-charcoal-900 text-white group-hover:text-charcoal-900 group-active:text-charcoal-900 group-focus-visible:text-charcoal-900',
  outline: 'relative border border-line bg-card text-text',
  ghost: 'relative text-text group-hover:bg-inset group-focus-visible:bg-inset',
  icon: 'relative border border-line bg-card text-text',
  // Icon-only orange: a white glyph needs just 3:1 (non-text contrast). Hover lifts it to orange-400.
  accent: 'relative bg-orange-500 text-white group-hover:bg-orange-400 group-focus-visible:bg-orange-400',
  // Orange-ink text (AA on white and on orange-50); hover/focus tint the background orange-50.
  copilot: 'relative text-orange-ink group-hover:bg-orange-50 group-focus-visible:bg-orange-50',
}

const PRESSED_STYLES: Partial<Record<ButtonVariant, string>> = {
  outline: 'border-charcoal-900 bg-charcoal-900 text-white group-hover:border-charcoal-900',
  ghost: 'bg-inset',
  icon: 'border-charcoal-900 bg-charcoal-900 text-white group-hover:border-charcoal-900',
}

const SIZE_STYLES: Record<ButtonVariant, Record<ButtonSize, string>> = {
  primary: {
    sm: `${BUTTON_HEIGHT.sm} gap-2.5 pl-4.5 pr-1.5`,
    md: `${BUTTON_HEIGHT.md} gap-3.75 pl-6.5 pr-2`,
    lg: `${BUTTON_HEIGHT.lg} gap-4.5 pl-7.5 pr-2.25`,
  },
  dark: {
    sm: `${BUTTON_HEIGHT.sm} gap-2.5 pl-4.5 pr-1.5`,
    md: `${BUTTON_HEIGHT.md} gap-3.75 pl-6.5 pr-2`,
    lg: `${BUTTON_HEIGHT.lg} gap-4.5 pl-7.5 pr-2.25`,
  },
  outline: {
    sm: `${BUTTON_HEIGHT.sm} gap-2 px-4.5`,
    md: `${BUTTON_HEIGHT.md} gap-3.75 px-6.5`,
    lg: `${BUTTON_HEIGHT.lg} gap-4 px-7.5`,
  },
  ghost: {
    sm: `${BUTTON_HEIGHT.sm} gap-2 px-4`,
    md: `${BUTTON_HEIGHT.md} gap-3 px-6`,
    lg: `${BUTTON_HEIGHT.lg} gap-3.5 px-7`,
  },
  icon: {
    sm: BUTTON_SQUARE.sm,
    md: BUTTON_SQUARE.md,
    lg: BUTTON_SQUARE.lg,
  },
  accent: {
    sm: BUTTON_SQUARE.sm,
    md: BUTTON_SQUARE.md,
    lg: BUTTON_SQUARE.lg,
  },
  // Text + icon, padded like ghost so the hover tint has room around them.
  copilot: {
    sm: `${BUTTON_HEIGHT.sm} gap-2 px-3.5`,
    md: `${BUTTON_HEIGHT.md} gap-2.5 px-5`,
    lg: `${BUTTON_HEIGHT.lg} gap-3 px-6`,
  },
}

const ARROW_SIZES: Record<ButtonSize, number> = { sm: 16, md: 18, lg: 20 }
const CIRCLE_SIZES: Record<ButtonSize, string> = { sm: 'size-7', md: 'size-9', lg: 'size-11' }

const FILL_STYLES: Record<ButtonSize, string> = {
  sm: '[clip-path:inset(6px_6px_6px_calc(100%-34px)_round_999px)]',
  md: '[clip-path:inset(9px_9px_9px_calc(100%-45px)_round_999px)]',
  lg: '[clip-path:inset(10px_10px_10px_calc(100%-54px)_round_999px)]',
}

const TRACE_RADIUS: Record<ButtonSize, number> = { sm: 18.5, md: 25.5, lg: 30.5 }

/** White arrow circle: orange arrow on the orange CTA, black arrow on the dark one. */
const CIRCLE_STYLE: Partial<Record<ButtonVariant, string>> = {
  primary: 'bg-white text-charcoal-900',
  dark: 'bg-white text-charcoal-900',
}

/**
 * The one button of the app (ARCHITECTURE §11). Primary is the only orange one and always
 * carries the arrow: on hover a white fill spills out of the arrow circle and the arrow turns.
 * Outline and icon draw an orange trace around themselves; ghost stays quiet.
 */
export const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(function Button(props, ref) {
  const {
    variant = 'primary',
    size = 'md',
    ariaLabel,
    className,
    wFull = false,
    alignLeft = false,
    disabled = false,
    noStyle = false,
    hover,
    pressed,
    title,
    circleIcon,
    children,
    ...native
  } = props
  // Split off the props that decide the element; whatever is left are plain DOM attributes.
  const { type, href, onClick, ...rest } = native as Record<string, unknown> & {
    type?: NativeButtonProps['type']
    href?: string
    onClick?: (e: MouseEvent<HTMLElement>) => void
  }

  const spills = variant === 'primary' || variant === 'dark'
  const showArrow = !noStyle && spills
  const CircleIcon = circleIcon ?? ArrowUpRightIcon
  // The arrow turns 45°; a plus turns 90° (45° would read as a close "×"); other glyphs (a check)
  // stay still — turning them looks broken.
  const turn =
    !circleIcon
      ? 'group-hover:rotate-45 group-active:rotate-45 group-focus-visible:rotate-45'
      : circleIcon === PlusIcon
        ? 'group-hover:rotate-90 group-active:rotate-90 group-focus-visible:rotate-90'
        : ''
  const traced = !noStyle && (variant === 'outline' || variant === 'icon') && !pressed

  const wrapperClass = twMerge(
    noStyle ? 'cursor-pointer' : 'group inline-flex shrink-0 cursor-pointer rounded-full outline-none',
    !noStyle && (wFull ? 'w-full' : 'w-fit'),
    disabled ? 'pointer-events-none cursor-not-allowed opacity-40' : '',
    hover,
    className,
  )

  const pillClass = twMerge(
    'inline-flex items-center justify-center rounded-full font-nav text-nav font-medium lowercase select-none',
    `transition-[color,border-color,background-color,translate] ${T}`,
    'group-focus-visible:outline-2 group-focus-visible:outline-offset-4 group-focus-visible:outline-orange-500',
    'group-active:translate-y-px',
    VARIANT_STYLES[variant],
    SIZE_STYLES[variant][size],
    pressed ? PRESSED_STYLES[variant] : '',
    wFull ? 'w-full' : '',
  )

  const content = noStyle ? (
    children
  ) : (
    <span className={pillClass}>
      {spills && (
        <span
          aria-hidden="true"
          className={twMerge(
            // The white fill carries an orange edge: invisible while clipped to the arrow circle,
            // it outlines the whole pill once the fill spills over (white button on white cards).
            'absolute -inset-px -z-10 rounded-full border border-orange-500 bg-white',
            `transition-[clip-path] ${T}`,
            'group-hover:[clip-path:inset(0_round_999px)] group-active:[clip-path:inset(0_round_999px)] group-focus-visible:[clip-path:inset(0_round_999px)]',
            FILL_STYLES[size],
          )}
        />
      )}
      {traced && (
        <svg
          aria-hidden="true"
          fill="none"
          className="pointer-events-none absolute -top-px -left-px h-[calc(100%+2px)] w-[calc(100%+2px)] overflow-visible"
        >
          <rect
            x="0.5"
            y="0.5"
            rx={TRACE_RADIUS[size]}
            pathLength={1}
            strokeWidth="1"
            className={twMerge(
              'h-[calc(100%-1px)] w-[calc(100%-1px)] stroke-orange-500 [stroke-dasharray:1] [stroke-dashoffset:1]',
              `transition-[stroke-dashoffset] ${T}`,
              // Trace only on pointer hover: on keyboard focus the single orange focus ring is enough.
              'group-hover:[stroke-dashoffset:0] group-active:[stroke-dashoffset:0]',
            )}
          />
        </svg>
      )}
      <span
        className={twMerge(
          'relative inline-flex items-center gap-[inherit]',
          wFull ? (showArrow || alignLeft ? 'flex-1 justify-start text-left' : 'flex-1 justify-center') : '',
        )}
      >
        {children}
      </span>
      {showArrow && (
        <span aria-hidden="true" className={twMerge('grid shrink-0 place-items-center rounded-full', CIRCLE_SIZES[size], CIRCLE_STYLE[variant])}>
          <CircleIcon size={ARROW_SIZES[size]} weight="regular" className={`transition-[rotate] ${T} ${turn}`} />
        </span>
      )}
    </span>
  )

  if (type) {
    return (
      <button
        {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
        ref={ref as Ref<HTMLButtonElement>}
        type={type}
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-pressed={pressed}
        title={title}
        className={wrapperClass}
      >
        {content}
      </button>
    )
  }

  if (disabled) {
    return (
      <span aria-label={ariaLabel} aria-disabled="true" role="link" className={wrapperClass}>
        {content}
      </span>
    )
  }

  const target = href ?? '/'
  if (EXTERNAL_HREF.test(target)) {
    const newTab = /^https?:/i.test(target)
    return (
      <a
        {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}
        ref={ref as Ref<HTMLAnchorElement>}
        href={target}
        onClick={onClick}
        aria-label={ariaLabel}
        title={title}
        target={newTab ? '_blank' : undefined}
        rel={newTab ? 'noopener noreferrer' : undefined}
        className={wrapperClass}
      >
        {content}
      </a>
    )
  }

  return (
    <Link
      {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}
      ref={ref as Ref<HTMLAnchorElement>}
      to={target as LinkProps['to']}
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
      className={wrapperClass}
    >
      {content}
    </Link>
  )
})

export default Button
