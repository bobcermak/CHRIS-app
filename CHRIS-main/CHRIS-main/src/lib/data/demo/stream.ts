import type { StreamEvent } from '../contract'
import type { StreamOp } from '../source'

/**
 * Demo speed factor. `?demoSpeed=0.05` in the URL (or localStorage `chris:demo-speed`)
 * makes streams near-instant — used by e2e tests.
 */
function speed(): number {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('demoSpeed')
    if (fromUrl) localStorage.setItem('chris:demo-speed', fromUrl)
    const raw = fromUrl ?? localStorage.getItem('chris:demo-speed')
    const value = raw ? Number(raw) : 1
    return Number.isFinite(value) && value >= 0 ? value : 1
  } catch {
    return 1
  }
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason)
    const t = window.setTimeout(resolve, ms * speed())
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(t)
        reject(signal.reason)
      },
      { once: true },
    )
  })
}

export type Phase = readonly [stage: string, ms: number]

/** Simulates an SSE stream: thinking events per phase, progress, then the result (or an error). */
export function simulate<T>(phases: readonly Phase[], produce: () => T | Promise<T>, fail?: string): StreamOp<T> {
  return async function* run(signal: AbortSignal): AsyncGenerator<StreamEvent> {
    const total = phases.reduce((sum, [, ms]) => sum + ms, 0)
    let done = 0
    for (const [stage, ms] of phases) {
      yield { type: 'thinking', stage }
      const steps = Math.max(1, Math.round(ms / 400))
      for (let i = 0; i < steps; i++) {
        await wait(ms / steps, signal)
        done += ms / steps
        yield { type: 'progress', stage, pct: (done / total) * 100 }
      }
    }
    if (fail) {
      yield { type: 'error', message: fail, recoverable: true }
      return
    }
    yield { type: 'result', data: await produce() }
  }
}
