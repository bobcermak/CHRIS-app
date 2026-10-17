import { FileTextIcon, ImageIcon, XIcon } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { formatBytes, type Attachment } from '../../lib/attachments'
import { pop } from '../../motion/presets'

/** Attached files as chips: name, size and a remove cross. */
export function AttachmentChips({ items, onRemove }: { items: Attachment[]; onRemove: (id: string) => void }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Přílohy">
      <AnimatePresence initial={false}>
        {items.map((a) => {
          const Icon = a.file.type.startsWith('image/') ? ImageIcon : FileTextIcon
          return (
            <motion.li key={a.id} layout variants={pop} initial="hidden" animate="show" exit="exit">
              <span className="inline-flex max-w-[280px] items-center gap-1.5 rounded-full bg-inset py-1 pr-1 pl-2.5 text-small text-charcoal-700">
                <Icon size={16} className="shrink-0" aria-hidden />
                <span className="truncate">{a.file.name}</span>
                <span className="shrink-0 font-mono text-meta text-text-muted">{formatBytes(a.file.size)}</span>
                <button
                  type="button"
                  onClick={() => onRemove(a.id)}
                  className="inline-flex size-5 shrink-0 items-center justify-center rounded-full transition-colors duration-(--dur-hover) ease-(--ease-out) hover:bg-panel hover:text-text"
                  aria-label={`Odebrat přílohu ${a.file.name}`}
                >
                  <XIcon size={12} aria-hidden />
                </button>
              </span>
            </motion.li>
          )
        })}
      </AnimatePresence>
    </ul>
  )
}
