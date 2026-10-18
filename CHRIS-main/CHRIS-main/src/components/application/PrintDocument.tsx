import { useState } from 'react'
import type { ApplicationDraft } from '../../lib/data'
import { AI_DRAFT_NOTICE, UNVERIFIED_NOTICE } from '../../lib/templates'
import { MarkdownText } from './MarkdownText'

interface PrintDocumentProps {
  app: ApplicationDraft
  title: string
  scheme: string
  callName?: string
}

/**
 * Print-only rendering of the application — what "Exportovat PDF" saves (the browser's
 * Save as PDF on an A4 page set up in index.css). Section text is rendered from markdown;
 * the AI-draft notice is always there.
 */
export function PrintDocument({ app, title, scheme, callName }: PrintDocumentProps) {
  const [today] = useState(() => new Date().toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' }))
  return (
    <article className="print-only text-[11pt] leading-[1.45] text-black">
      <header className="mb-6 border-b border-black/30 pb-3">
        {/* Scheme and call name often both start with the agency — each part once. */}
        <p className="text-[9pt] tracking-[0.1em] uppercase">{[...new Set([scheme, callName].filter(Boolean).join(' · ').split(' · '))].join(' · ')}</p>
        <h1 className="mt-1 text-[18pt] leading-tight font-semibold">{title}</h1>
        <p className="mt-1 text-[9pt]">Koncept přihlášky · {today}</p>
      </header>
      {app.sections.map((s, i) => (
        <section key={s.key} className="mb-5">
          {/* The heading never ends a page alone. */}
          <h2 className="mb-1.5 text-[12pt] font-semibold break-after-avoid">
            {i + 1}. {s.title}
          </h2>
          {s.content_md.trim() ? <MarkdownText text={s.content_md} /> : <p className="italic">Sekce není vyplněná.</p>}
        </section>
      ))}
      <footer className="mt-10 border-t border-black/30 pt-2 text-[8.5pt] break-inside-avoid">
        <p>{AI_DRAFT_NOTICE}</p>
        {app.template_status !== 'verified' && <p>{UNVERIFIED_NOTICE}</p>}
      </footer>
    </article>
  )
}
