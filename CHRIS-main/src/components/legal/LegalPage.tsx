import { Children, type ReactNode } from 'react'
import { site } from '../../lib/site'
import { GROW_UNDERLINE } from '../ui/linkStyles'
import { Reveal } from '../ui/Reveal'

/** Typographic long-form page for legal texts. */
export function LegalPage({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <article className="mx-auto w-full max-w-[720px] px-5 pt-14 pb-24">
      <p className="font-mono text-meta tracking-[0.12em] text-text-muted uppercase">{eyebrow}</p>
      <h1 className="mt-2 font-display text-display font-medium">{title}</h1>
      <p className="mt-2 text-small text-text-muted">Aktualizováno {site.updated}</p>
      <div className="mt-10 flex flex-col gap-8 text-body text-text [&_h2]:mb-2 [&_h2]:font-display [&_h2]:text-heading [&_h2]:font-medium [&_li]:ml-5 [&_li]:list-disc [&_p+p]:mt-3 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">
        {Children.map(children, (child, i) => (
          <Reveal delay={Math.min(i, 3) * 0.05}>{child}</Reveal>
        ))}
      </div>
    </article>
  )
}

/** Contact line that admits when the team has not filled the contact in yet. */
export function Contact() {
  return site.contactEmail ? (
    <a href={`mailto:${site.contactEmail}`} className={`text-info ${GROW_UNDERLINE}`}>
      {site.contactEmail}
    </a>
  ) : (
    <span className="text-text-muted">kontakt doplní tým před veřejným nasazením</span>
  )
}
