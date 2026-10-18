/**
 * Button heights shared by every variant (primary / outline / ghost / icon).
 * Geometry derived from the height H and the arrow circle C:
 *   fill clip-path inset = (H − C) / 2, its left edge = 100% − (C + inset), trace radius = H / 2 − 1.5
 * `sm` exists for dense contexts (row toggles, side panel, copilot), where 54 px would not fit.
 */
export type ButtonSize = 'sm' | 'md' | 'lg'

export const BUTTON_HEIGHT: Record<ButtonSize, string> = {
  sm: 'h-10', // 40 px · circle 28 · inset 6 · radius 18.5
  md: 'h-[54px]', // 54 px · circle 36 · inset 9 · radius 25.5
  lg: 'h-16', // 64 px · circle 44 · inset 10 · radius 30.5
}

/** Square size for the `icon` variant — same height as the other variants. */
export const BUTTON_SQUARE: Record<ButtonSize, string> = {
  sm: 'size-10',
  md: 'size-[54px]',
  lg: 'size-16',
}
