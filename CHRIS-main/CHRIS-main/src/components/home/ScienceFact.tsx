import { ArrowUpRightIcon } from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { randomFact, sourceName } from '../../lib/facts'
import { intro, introEase } from '../../motion/presets'

/**
 * Opening line of the home page: one surprising, sourced science fact instead of a greeting.
 * Always the same size, never clamped: a longer fact simply wraps onto more lines. The sentence
 * comes in word by word as a single soft wave (each word ~700 ms, part of the home intro) —
 * never letter by letter.
 */
export function ScienceFact() {
  const [fact] = useState(randomFact)
  const reduce = useReducedMotion()
  const words = fact.text_cs.split(' ')
  // The wave spans at most ~0.9 s whatever the fact length; each word eases in over 0.7 s.
  const step = Math.min(0.045, 0.9 / words.length)
  const start = intro.start + intro.step
  const wordDur = 0.7

  return (
    <figure className="mb-6 flex w-full flex-col items-center text-center">
      <blockquote className="max-w-[min(92vw,1000px)] font-display text-[clamp(1.3rem,1rem+1.1vw,1.85rem)] leading-[1.2] font-medium tracking-[-0.025em] text-balance text-text">
        {words.map((w, i) => (
          <motion.span
            key={`${w}-${i}`}
            className="inline-block"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: '0.35em', filter: 'blur(6px)' }}
            // Drop the filter once in: a leftover blur(0px) keeps a filter layer per word that flickers.
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transitionEnd: { filter: 'none' } }}
            transition={{ duration: wordDur, ease: introEase, delay: reduce ? 0 : start + i * step }}
          >
            {w}
            {i < words.length - 1 ? ' ' : ''}
          </motion.span>
        ))}
      </blockquote>
      <motion.figcaption
        className="mt-2.5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: wordDur, ease: introEase, delay: reduce ? 0 : start + words.length * step }}
      >
        {/* Hover: the label darkens while an orange line grows under it (text only, not the icon),
            and the arrow turns inside a small warm circle — the same language as the buttons. */}
        <a
          href={fact.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-1.5 rounded-full font-mono text-meta tracking-[0.08em] text-text-muted uppercase transition-colors duration-(--dur-hover) ease-(--ease-out) outline-none hover:text-text focus-visible:text-text focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-500"
        >
          <span className="bg-[linear-gradient(var(--orange-500),var(--orange-500))] bg-[length:0%_1px] bg-left-bottom bg-no-repeat pb-0.5 transition-[background-size] duration-(--dur-hover) ease-(--ease-out) group-hover:bg-[length:100%_1px] group-focus-visible:bg-[length:100%_1px]">
            Zdroj: {sourceName(fact.source_url)}
          </span>
          <span
            aria-hidden
            className="grid size-5 place-items-center rounded-full transition-colors duration-(--dur-hover) ease-(--ease-out) group-hover:bg-orange-50 group-hover:text-orange-ink group-focus-visible:bg-orange-50 group-focus-visible:text-orange-ink"
          >
            <ArrowUpRightIcon
              size={12}
              className="transition-transform duration-(--dur-hover) ease-(--ease-out) group-hover:rotate-45 group-focus-visible:rotate-45"
            />
          </span>
        </a>
      </motion.figcaption>
    </figure>
  )
}
