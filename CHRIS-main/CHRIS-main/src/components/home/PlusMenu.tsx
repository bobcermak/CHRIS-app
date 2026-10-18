import { CaretRightIcon, FileArrowUpIcon, LinkSimpleIcon, NotebookIcon, PlusIcon } from '@phosphor-icons/react'
import * as Menu from '@radix-ui/react-dropdown-menu'
import type { ReactNode } from 'react'
import { PROMPT_TEMPLATES } from '../../lib/composer'
import { Button } from '../ui/Button'

interface PlusMenuProps {
  disabled?: boolean
  onUpload: () => void
  onAddLink: () => void
  onTemplate: (text: string) => void
  /** Where focus goes when the menu closes (the prompt field), instead of back to "+". */
  onClosed?: () => void
}

const CONTENT =
  'menu-pop z-50 min-w-[260px] rounded-[20px] border border-line bg-card p-1.5 shadow-[0_24px_60px_-28px_rgb(29_29_31/0.35)] outline-none'

const ITEM =
  'group/item relative flex h-10 cursor-pointer items-center gap-3 rounded-xl px-3 text-small text-text outline-none select-none transition-colors duration-(--dur-hover) ease-(--ease-out) data-[highlighted]:bg-inset data-[state=open]:bg-inset data-[disabled]:opacity-40'

function Item({ icon, children, hint, ...props }: Menu.DropdownMenuItemProps & { icon: ReactNode; hint?: string }) {
  return (
    <Menu.Item className={ITEM} {...props}>
      <span className="text-text-muted transition-colors duration-(--dur-hover) ease-(--ease-out) group-data-[highlighted]/item:text-orange-500">{icon}</span>
      <span className="flex-1">{children}</span>
      {hint && <span className="font-mono text-meta text-text-muted">{hint}</span>}
    </Menu.Item>
  )
}

function SubTrigger({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <Menu.SubTrigger className={ITEM}>
      <span className="text-text-muted transition-colors duration-(--dur-hover) ease-(--ease-out) group-data-[highlighted]/item:text-orange-500 group-data-[state=open]/item:text-orange-500">
        {icon}
      </span>
      <span className="flex-1">{children}</span>
      <CaretRightIcon size={16} className="text-text-muted" aria-hidden />
    </Menu.SubTrigger>
  )
}

/**
 * "+" in the composer (like Claude / ChatGPT): attach files, links and example prompts.
 * Radix gives role=menu, arrow keys, Enter, Esc and focus handling.
 */
export function PlusMenu(props: PlusMenuProps) {
  const { disabled, onUpload, onAddLink, onTemplate, onClosed } = props

  return (
    <Menu.Root>
      <Menu.Trigger asChild disabled={disabled}>
        <Button type="button" variant="icon" size="sm" ariaLabel="Přidat k zadání" title="Přidat soubor, odkaz, výzvu…" disabled={disabled}>
          <PlusIcon size={18} aria-hidden className="transition-transform duration-(--dur-hover) ease-(--ease-out) group-data-[state=open]:rotate-45" />
        </Button>
      </Menu.Trigger>

      <Menu.Portal>
        <Menu.Content
          className={CONTENT}
          side="top"
          align="start"
          sideOffset={10}
          collisionPadding={16}
          loop
          onCloseAutoFocus={(e) => {
            if (!onClosed) return
            e.preventDefault()
            onClosed()
          }}
        >
          <Item icon={<FileArrowUpIcon size={20} />} hint="PDF · DOCX · MD" onSelect={onUpload}>
            Nahrát soubor
          </Item>
          <Item icon={<LinkSimpleIcon size={20} />} hint="URL · DOI" onSelect={onAddLink}>
            Přidat odkaz
          </Item>

          <Menu.Separator className="mx-2 my-1.5 h-px bg-line" />
          <Menu.Sub>
            <SubTrigger icon={<NotebookIcon size={20} />}>Vzorová zadání</SubTrigger>
            <Menu.Portal>
              <Menu.SubContent className={`${CONTENT} w-[340px]`} sideOffset={8} collisionPadding={16} loop>
                {PROMPT_TEMPLATES.map((t) => (
                  <Menu.Item key={t.title} className={`${ITEM} h-auto flex-col items-start gap-0.5 py-2.5`} onSelect={() => onTemplate(t.text)}>
                    <span className="font-medium">{t.title}</span>
                    <span className="line-clamp-2 text-[0.75rem] leading-5 text-text-muted">{t.text}</span>
                  </Menu.Item>
                ))}
              </Menu.SubContent>
            </Menu.Portal>
          </Menu.Sub>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}
