import { Button } from '../ui/Button'

/** Factual inline error with a retry — never a playful verb (§10.1). */
export function ErrorNote({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-risk/30 bg-card px-5 py-4">
      <p className="text-body text-text">{message ?? 'Něco se nepovedlo.'}</p>
      {onRetry && (
        <Button type="button" variant="outline" size="sm" ariaLabel="Zkusit znovu" onClick={onRetry}>
          Zkusit znovu
        </Button>
      )}
    </div>
  )
}
