import { motion, useReducedMotion } from 'motion/react'
import { dur, ease, introEase } from '../../motion/presets'
import { cn } from '../../lib/utils/cn'

export type OrbitPhase = 'idle' | 'focus' | 'converge'

interface Ring {
  r: number
  period: number
  reverse?: boolean
  nodes: { angle: number; tone: 'accent' | 'ink' | 'soft'; size: number; halo?: boolean }[]
}

// Concentric "network" rings. Nodes = research groups; the accent ones are matches.
const RINGS: Ring[] = [
  { r: 280, period: 140, nodes: [{ angle: -30, tone: 'accent', size: 6, halo: true }, { angle: 160, tone: 'ink', size: 3.5 }] },
  { r: 420, period: 190, reverse: true, nodes: [{ angle: 205, tone: 'ink', size: 3.5 }, { angle: 30, tone: 'soft', size: 4 }, { angle: 128, tone: 'accent', size: 5 }] },
  { r: 570, period: 240, nodes: [{ angle: 96, tone: 'accent', size: 5, halo: true }, { angle: -42, tone: 'soft', size: 4 }] },
  { r: 720, period: 300, reverse: true, nodes: [{ angle: 200, tone: 'soft', size: 4 }] },
]

const FILL = { accent: 'var(--orange-500)', ink: 'var(--charcoal-700)', soft: 'var(--charcoal-300)' }

/**
 * Background of 01 Zadání: dotted grid, soft orange glow, slowly orbiting nodes.
 * Each ring is its own full-screen <svg> rotated as a whole, so the spin runs on the compositor
 * (rotating a <g> inside one SVG repainted the whole background every frame and made the page
 * flicker). Keeps orbiting while typing; never runs with reduced motion. On submit the network
 * converges to the centre.
 */
export function OrbitField({ phase }: { phase: OrbitPhase }) {
  const reduce = useReducedMotion()
  const converge = phase === 'converge'

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1.2, ease: introEase }}
    >
      <div className="dot-grid absolute inset-0 [mask-image:radial-gradient(closest-side,black_35%,transparent)]" />
      <motion.div
        className="absolute top-1/2 left-1/2 size-[min(90vw,760px)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,var(--orange-50),transparent)]"
        animate={{ opacity: converge ? 1 : phase === 'focus' ? 0.95 : 0.7, scale: converge ? 0.7 : 1 }}
        transition={{ duration: dur.slow, ease }}
      />
      <motion.div
        className="absolute inset-0"
        animate={reduce ? { opacity: converge ? 0 : 1 } : { scale: converge ? 0.4 : 1, opacity: converge ? 0 : 1 }}
        transition={{ duration: dur.slow, ease }}
      >
        {RINGS.map((ring) => (
          <svg
            key={ring.r}
            viewBox="-800 -800 1600 1600"
            preserveAspectRatio="xMidYMid slice"
            className={cn('orbit absolute inset-0 size-full overflow-visible', ring.reverse && 'orbit-reverse', reduce && 'orbit-paused')}
            style={{ animationDuration: `${ring.period}s` }}
          >
            <circle r={ring.r} fill="none" stroke="var(--line-strong)" strokeOpacity={0.7} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
            {ring.nodes.map((n) => {
              const rad = (n.angle * Math.PI) / 180
              const x = Math.cos(rad) * ring.r
              const y = Math.sin(rad) * ring.r
              return (
                <g key={n.angle}>
                  {n.halo && <circle cx={x} cy={y} r={n.size * 2.6} fill="var(--orange-500)" fillOpacity={0.14} />}
                  <circle cx={x} cy={y} r={n.size} fill={FILL[n.tone]} />
                </g>
              )
            })}
          </svg>
        ))}
      </motion.div>
    </motion.div>
  )
}
