import type { ReactNode } from 'react'
import type { Citation, Claim } from '../../lib/data'
import { GROW_UNDERLINE } from '../ui/linkStyles'

interface ClaimsProps {
  claims: Claim[]
  citations: Record<string, Citation>
  /** Running counter so citation numbers are unique within a panel. */
  numbering: Map<string, number>
}

// Minimal inline markdown: **bold** then *italic*. Text is still rendered as text (no HTML),
// matching the "render API text as text" rule — we only wrap matched spans in <strong>/<em>.
const INLINE_RE = /\*\*([^*]+)\*\*|\*([^*\n]+)\*/g

function renderInline(text: string): ReactNode {
  if (!text.includes('*')) return text
  const nodes: ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(INLINE_RE)) {
    const start = match.index ?? 0
    if (start > last) nodes.push(text.slice(last, start))
    const [, bold, italic] = match
    nodes.push(bold ? <strong key={start}>{bold}</strong> : <em key={start}>{italic}</em>)
    last = start + match[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

/**
 * Claims with numbered sources. A claim without a citation is never shown (pillar 1:
 * "Žádné tvrzení bez zdroje"). AI text is set in the reading face; text is rendered as text, not HTML.
 */
export function Claims({ claims, citations, numbering }: ClaimsProps) {
  const visible = claims.filter((c) => c.text && c.citation_ids.some((id) => citations[id]))
  if (!visible.length) return null

  const numberOf = (id: string) => {
    if (!numbering.has(id)) numbering.set(id, numbering.size + 1)
    return numbering.get(id)!
  }

  return (
    <div className="flex flex-col gap-2">
      {visible.map((c) => (
        <p key={c.text} className="text-body text-text">
          {renderInline(c.text)}{' '}
          {c.citation_ids
            .filter((id) => citations[id])
            .map((id) => {
              const cite = citations[id]
              return (
                <a
                  key={id}
                  href={cite.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={cite.title ?? cite.url}
                  className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-inset px-1 align-[1px] font-mono text-[0.6875rem] text-info no-underline transition-colors hover:bg-orange-50 hover:text-orange-ink"
                >
                  <span className="sr-only">Zdroj </span>
                  {numberOf(id)}
                </a>
              )
            })}
        </p>
      ))}
    </div>
  )
}

/** Numbered source list for the bottom of a panel. */
export function SourceList({ citations, numbering }: { citations: Record<string, Citation>; numbering: Map<string, number> }) {
  const items = [...numbering.entries()].filter(([id]) => citations[id]).sort((a, b) => a[1] - b[1])
  if (!items.length) return null
  return (
    <ol className="flex flex-col gap-1.5">
      {items.map(([id, n]) => {
        const c = citations[id]
        return (
          <li key={id} className="flex min-w-0 gap-2 text-small">
            <span className="font-mono text-meta text-text-muted tabular">{n}</span>
            <a href={c.url} target="_blank" rel="noopener noreferrer" className={`min-w-0 break-all text-info ${GROW_UNDERLINE}`}>
              {c.title ?? c.url}
            </a>
          </li>
        )
      })}
    </ol>
  )
}
