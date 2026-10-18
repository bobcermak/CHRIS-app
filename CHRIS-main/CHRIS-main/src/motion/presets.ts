import type { Transition, Variants } from 'motion/react'

// ARCHITECTURE.md §10.2 — the base presets. Animations explain state changes, max 400 ms.
export const dur = { micro: 0.15, base: 0.25, slow: 0.4 };
export const ease = [0.22, 1, 0.36, 1] as const;
export const spring = { type: 'spring', stiffness: 380, damping: 32, mass: 0.8 } as const;
export const stagger = (i: number) => ({ delay: i * 0.04 });

export const easeOut: Transition = { duration: dur.base, ease }
export const easeSlow: Transition = { duration: dur.slow, ease }

/** Enters from slightly below, leaves upwards. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: (i: number = 0) => ({ opacity: 1, y: 0, transition: { ...easeOut, ...stagger(i) } }),
  exit: { opacity: 0, y: -6, transition: { duration: dur.micro, ease } },
}

/**
 * Home intro only (01 Zadání): a slower, softer entrance than the UI presets. A deliberate
 * exception to the 400 ms cap — it is a one-off page reveal, not feedback on a state change.
 */
export const introEase = [0.16, 1, 0.3, 1] as const
export const intro = { duration: 0.9, start: 0.15, step: 0.18 }

export const introUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: intro.duration, ease: introEase, delay: intro.start + i * intro.step },
  }),
}

/** Height collapse for answered questions, folded thinking, removed rows. */
export const collapse: Variants = {
  open: { opacity: 1, height: 'auto', transition: easeSlow },
  closed: { opacity: 0, height: 0, transition: easeOut },
}

/** Small confirmation pop (icon morphs, chips). */
export const pop: Variants = {
  hidden: { opacity: 0, scale: 0.85 },
  show: { opacity: 1, scale: 1, transition: spring },
  exit: { opacity: 0, scale: 0.9, transition: { duration: dur.micro, ease } },
}