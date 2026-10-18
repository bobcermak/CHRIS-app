import * as Dialog from '@radix-ui/react-dialog'
import { XIcon } from '@phosphor-icons/react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useRef, type ReactNode } from 'react'
import { dur, ease } from '../../motion/presets'
import { Button } from './Button'

interface SidePanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
}

/** Right-hand sheet (prototype v5 sidebar): warm panel background, white cards inside. */
export function SidePanel({ open, onOpenChange, title, description, children }: SidePanelProps) {
  const reduce = useReducedMotion()
  // No Radix Trigger (panels open from many places), so remember what had focus and return it on close.
  const returnTo = useRef<HTMLElement | null>(null)

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-40 bg-charcoal-900/20"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: dur.base, ease }}
              />
            </Dialog.Overlay>
            <Dialog.Content
              asChild
              forceMount
              onOpenAutoFocus={() => {
                // Runs before focus moves into the panel — remember the opener.
                returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
              }}
              onCloseAutoFocus={(e) => {
                e.preventDefault()
                returnTo.current?.focus()
              }}
            >
              <motion.aside
                className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[460px] flex-col bg-panel shadow-[-24px_0_60px_-30px_rgb(29_29_31/0.35)] outline-none sm:inset-y-2 sm:right-2 sm:rounded-[28px]"
                initial={reduce ? { opacity: 0 } : { x: '104%' }}
                animate={reduce ? { opacity: 1 } : { x: 0 }}
                exit={reduce ? { opacity: 0 } : { x: '104%' }}
                transition={{ duration: dur.slow, ease }}
              >
                <header className="flex items-center justify-between gap-3 px-6 pt-5 pb-3">
                  <Dialog.Title className="font-mono text-meta tracking-[0.1em] text-text-muted uppercase">{title}</Dialog.Title>
                  <Dialog.Close asChild>
                    <Button type="button" variant="icon" size="sm" ariaLabel="Zavřít panel" title="Zavřít (Esc)">
                      <XIcon size={16} aria-hidden />
                    </Button>
                  </Dialog.Close>
                </header>
                <Dialog.Description className="sr-only">{description ?? title}</Dialog.Description>
                <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-6 sm:px-5">{children}</div>
              </motion.aside>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}

/** White card inside the side panel, radius 24. */
export function PanelCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-panel bg-card p-5 ${className ?? ''}`}>{children}</div>
}
