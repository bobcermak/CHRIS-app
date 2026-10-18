/** Files a user can attach to the project prompt (drag & drop, paste, "+" menu). */

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

const ACCEPTED_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
])
const ACCEPTED_EXT = /\.(pdf|docx|txt|md|markdown|png|jpe?g|webp|gif)$/i

/** `accept` attribute for <input type="file">. */
export const ATTACHMENT_ACCEPT =
  '.pdf,.docx,.txt,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,image/*'

export interface Attachment {
  id: string
  file: File
}

export function validateAttachment(file: File): string | null {
  const typeOk = ACCEPTED_TYPES.has(file.type) || file.type.startsWith('image/') || ACCEPTED_EXT.test(file.name)
  if (!typeOk) return `Soubor „${file.name}“ nelze přiložit. Podporované jsou PDF, DOCX, TXT, Markdown (.md) a obrázky.`
  if (file.size > MAX_ATTACHMENT_BYTES) return `Soubor „${file.name}“ má víc než 10 MB.`
  return null
}

/** Pasted screenshots come without a useful name. */
export function withName(file: File, index: number): File {
  if (file.name && file.name !== 'image.png') return file
  const ext = file.type.split('/')[1] ?? 'png'
  return new File([file], `vlozeny-obrazek-${index + 1}.${ext}`, { type: file.type, lastModified: Date.now() })
}

const sizeFmt = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 1 })

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${sizeFmt.format(bytes / 1024)} kB`
  return `${sizeFmt.format(bytes / (1024 * 1024))} MB`
}

export const toMeta = (a: Attachment) => ({ name: a.file.name, size: a.file.size, type: a.file.type })
