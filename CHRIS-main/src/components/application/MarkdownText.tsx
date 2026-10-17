import type { ReactNode } from 'react'

/**
 * The small markdown subset the copilot and users write in sections — paragraphs, `#` headings,
 * `-`/`*`/`•` and `1.` lists, **bold** and *italic* — rendered as React elements (text nodes
 * only, never raw HTML). Used for the printed / PDF version of the application.
 */
export function MarkdownText({ text }: { text: string }) {
  return <>{blocks(text)}</>
}

const BULLET = /^\s*[-*•]\s+/
const NUMBERED = /^\s*\d+[.)]\s+/
const HEADING = /^\s*#{1,6}\s+/

function blocks(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }
    if (HEADING.test(line)) {
      out.push(
        <h3 key={i} className="mt-3 mb-1 text-[11pt] font-semibold break-after-avoid">
          {inline(line.replace(HEADING, ''))}
        </h3>,
      )
      i++
      continue
    }
    const list = BULLET.test(line) ? BULLET : NUMBERED.test(line) ? NUMBERED : null
    if (list) {
      const start = i
      const items: string[] = []
      while (i < lines.length && list.test(lines[i])) items.push(lines[i++].replace(list, ''))
      const Tag = list === BULLET ? 'ul' : 'ol'
      out.push(
        <Tag key={start} className={`my-1.5 pl-5 ${list === BULLET ? 'list-disc' : 'list-decimal'}`}>
          {items.map((item, k) => (
            <li key={k} className="mb-0.5">
              {inline(item)}
            </li>
          ))}
        </Tag>,
      )
      continue
    }
    // A paragraph runs until a blank line, a heading or a list.
    const start = i
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !HEADING.test(lines[i]) && !BULLET.test(lines[i]) && !NUMBERED.test(lines[i])) {
      para.push(lines[i++].trim())
    }
    out.push(
      <p key={start} className="mb-2">
        {inline(para.join(' '))}
      </p>,
    )
  }
  return out
}

/** **bold** and *italic*; everything else stays plain text (no `_`: it shows up in names and data). */
function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = []
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    parts.push(m[1] !== undefined ? <strong key={m.index}>{m[1]}</strong> : <em key={m.index}>{m[2]}</em>)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}
