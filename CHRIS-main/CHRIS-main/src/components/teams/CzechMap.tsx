import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import type { Group, Member } from '../../lib/data'
import { cn } from '../../lib/utils/cn'
import { initials, toPercent } from '../../lib/utils/format'
import { dur, ease } from '../../motion/presets'

type Node = Group['node']
type Point = { x: number; y: number }

export interface MapSeat {
  member: Member
  group: Group
  rank: number
}

// ---- geometry: a simplified Czech border (lon, lat), equirectangular at ~49.8° N ----------------

const BORDER: [number, number][] = [
  [12.09, 50.25], [12.2, 50.32], [12.5, 50.4], [12.95, 50.43], [13.2, 50.5], [13.5, 50.62],
  [13.9, 50.73], [14.3, 50.88], [14.31, 51.05], [14.6, 50.92], [14.82, 50.87], [15.0, 51.01],
  [15.2, 50.98], [15.4, 50.8], [15.8, 50.74], [16.1, 50.66], [16.3, 50.66], [16.45, 50.58],
  [16.2, 50.42], [16.4, 50.32], [16.6, 50.22], [16.85, 50.2], [17.0, 50.4], [16.9, 50.45],
  [17.2, 50.37], [17.6, 50.27], [17.75, 50.08], [18.0, 50.05], [18.3, 49.92], [18.6, 49.9],
  [18.85, 49.52], [18.55, 49.48], [18.4, 49.33], [18.15, 49.27], [18.0, 49.05], [17.75, 48.88],
  [17.5, 48.82], [17.2, 48.87], [16.95, 48.62], [16.6, 48.78], [16.4, 48.75], [16.1, 48.75],
  [15.85, 48.85], [15.5, 48.95], [15.15, 49.0], [14.95, 49.0], [14.9, 48.78], [14.7, 48.6],
  [14.4, 48.58], [14.05, 48.6], [13.85, 48.77], [13.6, 48.95], [13.35, 49.1], [13.0, 49.3],
  [12.7, 49.43], [12.5, 49.6], [12.45, 49.75], [12.5, 49.9], [12.25, 50.05], [12.15, 50.12],
]

const VW = 640
const K = VW / ((18.95 - 12.0) * Math.cos((49.8 * Math.PI) / 180))
const VH = Math.round((51.12 - 48.5) * K)
const project = (lon: number, lat: number): Point => ({
  x: (lon - 12.0) * Math.cos((49.8 * Math.PI) / 180) * K,
  y: (51.12 - lat) * K,
})
const OUTLINE = BORDER.map(([lon, lat]) => project(lon, lat))

function inside(p: Point) {
  let hit = false
  for (let i = 0, j = OUTLINE.length - 1; i < OUTLINE.length; j = i++) {
    const a = OUTLINE[i]
    const b = OUTLINE[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit
  }
  return hit
}

// The dotted land as one path of zero-length strokes (round caps draw the dots) — one element, fast.
const STEP = 9
const DOTS = (() => {
  let d = ''
  for (let y = STEP / 2; y < VH; y += STEP)
    for (let x = STEP / 2; x < VW; x += STEP) if (inside({ x, y })) d += `M${x.toFixed(1)} ${y.toFixed(1)}h0`
  return d
})()

const CITIES: Record<Node, Point> = {
  Praha: project(14.42, 50.08),
  Brno: project(16.61, 49.2),
  Olomouc: project(17.25, 49.59),
}
const NODES: Node[] = ['Praha', 'Brno', 'Olomouc']
// Where each label box sits relative to its city (map units — scaled with the map), and which way
// it grows from that point.
const LABEL: Record<Node, { dx: number; dy: number; align: 'left' | 'right' }> = {
  Praha: { dx: -90, dy: -90, align: 'right' },
  Brno: { dx: -80, dy: 80, align: 'right' },
  Olomouc: { dx: 80, dy: -80, align: 'left' },
}
const LABEL_HALF_H = 16

/** Arc between two cities, bowing upwards like flight paths. */
function arc(a: Point, b: Point) {
  const mx = (a.x + b.x) / 2
  const my = Math.min(a.y, b.y) - Math.hypot(b.x - a.x, b.y - a.y) * 0.35
  return `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`
}

/** Size of the element, kept up to date (the map scales with the space the card leaves). */
function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size] as const
}

/** Leader portrait in a map seat; initials when there is no photo or it fails to load. */
function SeatFace({ group }: { group: Group }) {
  const [failed, setFailed] = useState<string | null>(null)
  const src = group.photo_url
  if (src && failed !== src) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(src)}
        className="size-full rounded-full object-cover object-top"
      />
    )
  }
  return <span className="block translate-y-[0.5px]">{initials(group.pi_name)}</span>
}

// Tooltip: below the seat when there is no room above it in the viewport.
const TIP_ROOM = 80
// Grace period before hiding, so moving between neighbouring seats glides instead of blinking.
const TIP_HIDE_MS = 90

interface Tip {
  seat: MapSeat
  x: number
  y: number
  below: boolean
}

interface CzechMapProps {
  byNode: Record<Node, MapSeat[]>
  onOpen: (groupId: string) => void
  className?: string
}

/**
 * The team on a dotted map of Czechia: an orange marker per NÚVR node, arcs between the cities
 * the team spans, and a dark label per city holding its people (initials, click → profile).
 * Drawing in SVG; labels in HTML on top so they stay readable at any map size.
 */
export function CzechMap({ byNode, onOpen, className }: CzechMapProps) {
  const reduce = useReducedMotion()
  const [box, { w, h }] = useSize<HTMLDivElement>()
  // In viewport coordinates and rendered in a portal: the map's panel clips its overflow.
  const [tip, setTip] = useState<Tip | null>(null)
  const hideTimer = useRef<number | undefined>(undefined)

  const showTip = (seat: MapSeat) => (e: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => {
    window.clearTimeout(hideTimer.current)
    const r = e.currentTarget.getBoundingClientRect()
    const below = r.top < TIP_ROOM
    setTip({ seat, x: r.left + r.width / 2, y: below ? r.bottom + 8 : r.top - 8, below })
  }
  const hideTip = () => {
    window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setTip(null), TIP_HIDE_MS)
  }

  // A fixed tooltip would drift on scroll/resize — just hide it.
  useEffect(() => {
    if (!tip) return
    const close = () => setTip(null)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [tip])
  useEffect(() => () => window.clearTimeout(hideTimer.current), [])

  // Same fit as preserveAspectRatio="xMidYMid meet", so HTML labels land on the SVG points.
  const s = w && h ? Math.min(w / VW, h / VH) : 0
  const ox = (w - VW * s) / 2
  const oy = (h - VH * s) / 2
  const at = (p: Point) => ({ left: ox + p.x * s, top: oy + p.y * s })

  const active = NODES.filter((n) => byNode[n].length)
  const links = active.flatMap((a, i) => active.slice(i + 1).map((b) => [a, b] as const))

  return (
    <div ref={box} className={cn('relative', className)}>
      <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 size-full" aria-hidden>
        <path d={DOTS} stroke="var(--charcoal-700)" strokeOpacity={0.22} strokeWidth={4.2} strokeLinecap="round" fill="none" />

        {links.map(([a, b], i) => (
          <motion.path
            key={`${a}-${b}`}
            d={arc(CITIES[a], CITIES[b])}
            fill="none"
            stroke="var(--orange-500)"
            strokeWidth={2.4}
            strokeLinecap="round"
            initial={{ pathLength: reduce ? 1 : 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.9, ease, delay: 0.2 + i * 0.12 }}
          />
        ))}

        {NODES.map((node) => {
          const c = CITIES[node]
          const on = byNode[node].length > 0
          return on ? (
            <g key={node}>
              <circle cx={c.x} cy={c.y} r={14} fill="var(--orange-500)" fillOpacity={0.16} />
              <circle cx={c.x} cy={c.y} r={7} fill="var(--orange-500)" stroke="var(--inset)" strokeWidth={2.5} />
            </g>
          ) : (
            <circle key={node} cx={c.x} cy={c.y} r={4.5} fill="var(--charcoal-300)" />
          )
        })}
      </svg>

      {/* City labels: leader line + dark box with the people of that node */}
      {s > 0 &&
        NODES.map((node, i) => {
          const seats = byNode[node]
          const on = seats.length > 0
          const city = at(CITIES[node])
          const l = LABEL[node]
          // Offset scales with the map (min. 18 px so the leader line stays visible); the box is
          // kept inside the panel vertically.
          const k = Math.max(s, 18 / Math.abs(l.dy))
          const pos = {
            left: city.left + l.dx * k,
            top: Math.min(Math.max(city.top + l.dy * k, LABEL_HALF_H), h - LABEL_HALF_H),
          }
          return (
            <motion.div
              key={node}
              className="pointer-events-none absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, ease, delay: 0.35 + i * 0.08 }}
            >
              <svg className="absolute inset-0 size-full overflow-visible" aria-hidden>
                <line x1={city.left} y1={city.top} x2={pos.left} y2={pos.top} stroke={on ? 'var(--charcoal-500)' : 'var(--charcoal-300)'} strokeWidth={1} />
              </svg>
              <div
                className={cn(
                  'pointer-events-auto absolute flex -translate-y-1/2 items-center gap-2 rounded-[10px] px-2.5 py-1.5 whitespace-nowrap',
                  l.align === 'right' ? '-translate-x-full' : '',
                  on ? 'bg-charcoal-900 text-white shadow-[0_8px_20px_-10px_rgb(29_29_31/0.6)]' : 'border border-line-strong bg-card/80 text-text-muted',
                )}
                style={pos}
              >
                <span className="font-mono text-[0.6875rem] tracking-[0.14em] uppercase">{node}</span>
                {on && (
                  <span className="flex -space-x-1">
                    {seats.map((seat) => (
                      <button
                        key={seat.group.id}
                        type="button"
                        aria-label={`${seat.group.pi_name}, ${seat.group.institution}, shoda ${toPercent(seat.member.total)} %`}
                        onClick={() => onOpen(seat.group.id)}
                        onMouseEnter={showTip(seat)}
                        onMouseLeave={hideTip}
                        onFocus={showTip(seat)}
                        onBlur={hideTip}
                        // Ring drawn as a box-shadow (not a border) so the circle keeps its full size
                        // and the initials sit exactly in its centre. The best match gets an orange ring.
                        className={cn(
                          'relative inline-flex size-8 shrink-0 items-center justify-center rounded-full p-0 text-center text-[0.625rem] leading-none font-semibold tracking-[0.02em] transition-transform duration-(--dur-hover) ease-(--ease-out) hover:z-10 hover:-translate-y-0.5 hover:scale-110 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500',
                          seat.rank === 1
                            ? 'bg-orange-500 text-white shadow-[0_0_0_2px_var(--orange-500)]'
                            : 'bg-white text-charcoal-900 shadow-[0_0_0_2px_var(--charcoal-900)]',
                        )}
                      >
                        <SeatFace group={seat.group} />
                      </button>
                    ))}
                  </span>
                )}
              </div>
            </motion.div>
          )
        })}

      {createPortal(
        <AnimatePresence>
          {tip && (
            // Outer layer glides between seats (left/top), inner layer anchors the box to the point.
            <motion.div
              key="map-tip"
              className="pointer-events-none fixed z-50"
              initial={{ opacity: 0, left: tip.x, top: tip.y }}
              animate={{ opacity: 1, left: tip.x, top: tip.y }}
              exit={{ opacity: 0 }}
              transition={{ duration: dur.micro, ease }}
            >
              <div
                className={cn(
                  'flex -translate-x-1/2 items-center gap-2.5 rounded-[12px] bg-card px-3 py-2 text-small text-text shadow-[0_12px_30px_-12px_rgb(29_29_31/0.45)]',
                  !tip.below && '-translate-y-full',
                )}
              >
                {tip.seat.group.photo_url && (
                  <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-inset text-[0.625rem] font-semibold text-charcoal-700">
                    <SeatFace group={tip.seat.group} />
                  </span>
                )}
                <span>
                  <span className="block font-medium whitespace-nowrap">{tip.seat.group.pi_name}</span>
                  <span className="block text-[0.75rem] whitespace-nowrap text-text-muted">
                    {tip.seat.group.institution} · <span className="text-orange-ink">{toPercent(tip.seat.member.total)} %</span>
                  </span>
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  )
}
