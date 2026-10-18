import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { dur, ease } from '../../motion/presets'

const NODES = [
  { x: -170, y: -90 },
  { x: 180, y: -60 },
  { x: -120, y: 110 },
  { x: 150, y: 120 },
  { x: 0, y: -150 },
]

/**
 * Shown while files are dragged over the page: the frame draws itself around the viewport and
 * scattered "nodes" drift into the centre — the file is about to join the project.
 */
export function DropOverlay({ active }: { active: boolean }) {
  const reduce = useReducedMotion()
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-canvas/85 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease }}
        >
          <svg className="absolute inset-4 size-[calc(100%-2rem)] overflow-visible" preserveAspectRatio="none">
            <motion.rect
              x="0"
              y="0"
              width="100%"
              height="100%"
              rx="28"
              fill="none"
              stroke="var(--orange-500)"
              strokeWidth="1.5"
              initial={{ pathLength: reduce ? 1 : 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: dur.slow, ease }}
            />
          </svg>

          <div className="relative flex flex-col items-center">
            {!reduce &&
              NODES.map((n, i) => (
                <motion.span
                  key={i}
                  className="absolute size-2 rounded-full bg-orange-500"
                  initial={{ x: n.x, y: n.y, opacity: 0, scale: 0.6 }}
                  animate={{ x: n.x * 0.18, y: n.y * 0.18 - 36, opacity: [0, 1, 0.9], scale: 1 }}
                  transition={{ duration: dur.slow, ease, delay: i * 0.03 }}
                />
              ))}
            <motion.span
              className="mb-5 flex size-14 items-center justify-center rounded-full bg-orange-500"
              initial={{ scale: reduce ? 1 : 0.6 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 380, damping: 26 }}
            >
              <span className="size-2 rounded-full bg-white" />
            </motion.span>
            <p className="font-display text-title font-medium">Pusťte soubor, přidám ho k zadání</p>
            <p className="mt-1 text-small text-text-muted">PDF, DOCX, TXT, MD nebo obrázek, nejvýš 10 MB</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
