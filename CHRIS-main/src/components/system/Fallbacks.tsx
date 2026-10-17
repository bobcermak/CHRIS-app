import type { ErrorComponentProps } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Button } from '../ui/Button'

function Shell({ code, title, children }: { code: string; title: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col justify-center px-6 py-24">
      <p className="font-mono text-meta tracking-[0.12em] text-text-muted uppercase">{code}</p>
      <h1 className="mt-3 font-display text-display font-medium">{title}</h1>
      <div className="mt-4 text-body text-text-muted">{children}</div>
    </div>
  )
}

export function NotFound() {
  return (
    <Shell code="404" title="Tato stránka neexistuje">
      <p>Odkaz je neplatný nebo projekt už nemáme uložený v tomto prohlížeči.</p>
      <Button href="/" variant="primary" ariaLabel="Založit nový projekt" className="mt-8">
        Založit nový projekt
      </Button>
    </Shell>
  )
}

export function ErrorState({ error, reset }: ErrorComponentProps) {
  const message = error instanceof Error ? error.message : 'Neznámá chyba.'
  return (
    <Shell code="Chyba" title="Něco se nepovedlo">
      <p>{message}</p>
      <div className="mt-8 flex gap-3">
        <Button type="button" variant="primary" ariaLabel="Zkusit znovu" onClick={reset}>
          Zkusit znovu
        </Button>
        <Button href="/" variant="outline" ariaLabel="Na úvod">
          Na úvod
        </Button>
      </div>
    </Shell>
  )
}
