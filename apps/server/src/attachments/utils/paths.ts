import path from 'node:path'
import type { ChatAttachment } from '@workspace/contracts'

/**
 * The only image types the Anthropic API accepts. `chatAttachmentSchema` only
 * enforces `/^image\//i`, which is far wider (svg, bmp, heic, ...), so this
 * mapping — not the wire schema — is the real allowlist for what we persist
 * and what we are willing to hand back to a model.
 */
export function extensionForMimeType(mimeType: string): string | null {
  const normalized = mimeType.trim().toLowerCase()

  if (normalized === 'image/jpeg') return '.jpg'
  if (normalized === 'image/png') return '.png'
  if (normalized === 'image/gif') return '.gif'
  if (normalized === 'image/webp') return '.webp'
  return null
}

/**
 * Collapses a caller-supplied relative path to a safe, forward-slashed form, or
 * returns null when the input has no business addressing a blob: empty, NUL
 * poisoned, absolute, or escaping its root with `..`.
 */
export function normalizeAttachmentRelativePath(raw: string): string | null {
  if (raw.includes('\0')) return null
  // win32.isAbsolute is the superset check: it catches POSIX '/x', drive paths
  // 'C:\x', and UNC '\\x' regardless of the host platform.
  if (path.win32.isAbsolute(raw)) return null

  const normalized = path.normalize(raw).replaceAll('\\', '/')
  if (normalized.length === 0 || normalized === '.') return null
  if (normalized === '..' || normalized.startsWith('../')) return null
  return normalized
}

/**
 * The traversal guard. Resolves a relative path against the attachments root
 * and returns null unless the result is strictly inside that root.
 */
export function resolveAttachmentRelativePath(input: {
  readonly attachmentsDir: string
  readonly relativePath: string
}): string | null {
  const relativePath = normalizeAttachmentRelativePath(input.relativePath)
  if (!relativePath) return null

  const attachmentsRoot = path.resolve(input.attachmentsDir)
  const filePath = path.resolve(attachmentsRoot, relativePath)
  if (!filePath.startsWith(`${attachmentsRoot}${path.sep}`)) return null
  return filePath
}

/**
 * Blob file name for an attachment. Null when the mime type is outside the
 * Anthropic allowlist, or when the id would produce anything other than a
 * single safe path segment.
 */
export function attachmentFileName(attachment: ChatAttachment): string | null {
  const extension = extensionForMimeType(attachment.mimeType)
  if (!extension) return null

  const fileName = normalizeAttachmentRelativePath(`${attachment.id}${extension}`)
  if (!fileName || fileName.includes('/')) return null
  return fileName
}
