import { useCallback, useEffect, useRef, useState } from 'react'
import type { StreamEvent, Warning } from '../data/contract'
import type { StreamOp } from '../data/source'

export type StreamStatus = 'idle' | 'running' | 'done' | 'error'

export interface StreamState<T> {
  status: StreamStatus
  stage?: string
  verb?: string
  pct?: number
  /** Stages seen so far, with timing — for the folded "Analyzováno za 3 s · 3 kroky" summary. */
  steps: { stage: string; at: number }[]
  startedAt?: number
  finishedAt?: number
  warnings: Warning[]
  result?: T
  error?: string
}

const initial = <T,>(): StreamState<T> => ({ status: 'idle', steps: [], warnings: [] })

/**
 * Runs a streamed operation and exposes its live state. Starting again aborts the previous run;
 * unmount aborts too. `onResult` fires once with the final payload.
 */
export function useStream<T>(onResult?: (result: T) => void) {
  const [state, setState] = useState<StreamState<T>>(initial)
  const controller = useRef<AbortController | null>(null)
  const resultRef = useRef(onResult)
  useEffect(() => {
    resultRef.current = onResult
  })

  // Abort on real unmount only. StrictMode runs cleanup + setup synchronously in dev; the
  // microtask lets the re-mount win so an in-flight stream is not killed.
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      const ctrl = controller.current
      queueMicrotask(() => {
        if (!mounted.current) ctrl?.abort()
      })
    }
  }, [])

  const start = useCallback(async (op: StreamOp<T>) => {
    controller.current?.abort()
    const ctrl = new AbortController()
    controller.current = ctrl
    const startedAt = performance.now()
    setState({ ...initial<T>(), status: 'running', startedAt })

    try {
      for await (const event of op(ctrl.signal) as AsyncIterable<StreamEvent>) {
        if (ctrl.signal.aborted) return
        switch (event.type) {
          case 'thinking':
            setState((s) => ({
              ...s,
              stage: event.stage,
              verb: event.verb,
              steps: s.steps.at(-1)?.stage === event.stage ? s.steps : [...s.steps, { stage: event.stage, at: performance.now() }],
            }))
            break
          case 'progress':
            setState((s) => ({ ...s, stage: event.stage, pct: event.pct }))
            break
          case 'warning':
            setState((s) => ({ ...s, warnings: [...s.warnings, event.warning] }))
            break
          case 'error':
            setState((s) => ({ ...s, status: 'error', error: event.message, finishedAt: performance.now() }))
            return
          case 'result': {
            const result = event.data as T
            setState((s) => ({ ...s, status: 'done', result, finishedAt: performance.now() }))
            resultRef.current?.(result)
            return
          }
          case 'partial':
            break
        }
      }
    } catch (err) {
      if (ctrl.signal.aborted) return
      setState((s) => ({
        ...s,
        status: 'error',
        error: err instanceof Error ? err.message : 'Něco se pokazilo.',
        finishedAt: performance.now(),
      }))
    }
  }, [])

  const reset = useCallback(() => {
    controller.current?.abort()
    setState(initial)
  }, [])

  return { ...state, start, reset }
}
