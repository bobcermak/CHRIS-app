import { animate, useInView, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { dur, ease } from '../../motion/presets'

interface CountUpProps {
  value: number
  className?: string
}

/** Integer that counts up from its previous value once it is in view (§10.2 bod 4). */
export function CountUp({ value, className }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const reduce = useReducedMotion()
  const [shown, setShown] = useState(0)
  const from = useRef(0)

  useEffect(() => {
    if (!inView || reduce) return
    // Start from what is on screen now (safe if a previous run was interrupted).
    const controls = animate(from.current, value, {
      duration: dur.slow,
      ease,
      onUpdate: (v) => {
        from.current = v
        setShown(Math.round(v))
      },
    })
    return () => controls.stop()
  }, [inView, value, reduce])

  return (
    <span ref={ref} className={className}>
      {reduce ? value : shown}
    </span>
  )
}
