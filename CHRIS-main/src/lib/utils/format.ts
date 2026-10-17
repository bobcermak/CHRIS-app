const dateFmt = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' })

/** 0.94 → 94 */
export const toPercent = (fraction: number) => Math.round(fraction * 100)

/** ISO date → "30. 1. 2027" */
export function formatDate(iso: string | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d)
}

/** "doc. MUDr. Jana Veselá, Ph.D." → "JV" (skips academic titles). */
export function initials(name: string): string {
  const parts = name
    .replace(/,.*$/, '')
    .split(/\s+/)
    .filter((p) => p && !p.endsWith('.'))
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}

/** Seconds with one decimal under 10 s: 3.2 s, 14 s */
export function formatDuration(ms: number): string {
  const s = ms / 1000
  return s < 10 ? `${s.toFixed(1).replace('.', ',')} s` : `${Math.round(s)} s`
}

/** Czech plural: plural(3, ['krok', 'kroky', 'kroků']) */
export function plural(n: number, [one, few, many]: readonly [string, string, string]): string {
  if (n === 1) return one
  if (n >= 2 && n <= 4) return few
  return many
}

/** Signed percentage-point change: 0.021 → "+2 %", -0.004 → "±0 %" */
export function formatDelta(fraction: number): string {
  const pts = Math.round(fraction * 100)
  if (pts === 0) return '±0 %'
  return `${pts > 0 ? '+' : '−'}${Math.abs(pts)} %`
}
