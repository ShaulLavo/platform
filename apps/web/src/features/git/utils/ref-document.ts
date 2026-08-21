import { basename } from '@/lib/path-formatters'

export const REF_DOCUMENT_PREFIX = 'git-ref:'

export type RefDocumentInfo = {
  readonly path: string
  readonly ref: string
}

/**
 * Document id for "this file as of a git ref".
 *
 * The payload is encoded rather than joined with a separator because both a path and a ref can
 * contain `:` (`HEAD:src/a.ts`, `refs/heads/x`), which a naive split would tear apart.
 */
export function refDocumentId({ path, ref }: RefDocumentInfo): string {
  return `${REF_DOCUMENT_PREFIX}${encodeURIComponent(JSON.stringify({ path, ref, version: 1 }))}`
}

export function parseRefDocumentId(id: string | null | undefined): RefDocumentInfo | null {
  if (!id?.startsWith(REF_DOCUMENT_PREFIX)) return null

  try {
    const payload: unknown = JSON.parse(decodeURIComponent(id.slice(REF_DOCUMENT_PREFIX.length)))
    return refDocumentInfo(payload)
  } catch {
    return null
  }
}

export function refDocumentLabel(id: string): string {
  const info = parseRefDocumentId(id)
  if (!info) return basename(id)

  return `${basename(info.path)} (${info.ref})`
}

function refDocumentInfo(payload: unknown): RefDocumentInfo | null {
  if (!payload || typeof payload !== 'object') return null

  const record = payload as Record<string, unknown>
  if (record.version !== 1) return null
  if (typeof record.path !== 'string' || record.path.length === 0) return null
  if (typeof record.ref !== 'string' || record.ref.length === 0) return null

  return { path: record.path, ref: record.ref }
}
