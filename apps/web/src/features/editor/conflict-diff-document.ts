import { basename, displayPath } from '@/lib/path-formatters'

const CONFLICT_DIFF_DOCUMENT_PREFIX = 'conflict-diff:'

export type ConflictDiffDocumentInfo = {
  id: string
  conflictId: string
}

export function conflictDiffDocumentId(conflictId: string) {
  return `${CONFLICT_DIFF_DOCUMENT_PREFIX}${encodeURIComponent(conflictId)}`
}

export function parseConflictDiffDocumentId(
  id: string | null | undefined,
): ConflictDiffDocumentInfo | null {
  if (!id?.startsWith(CONFLICT_DIFF_DOCUMENT_PREFIX)) return null

  try {
    const conflictId = decodeURIComponent(id.slice(CONFLICT_DIFF_DOCUMENT_PREFIX.length))
    if (!conflictId) return null

    return { conflictId, id }
  } catch {
    return null
  }
}

export function conflictDiffDocumentLabel(path: string | null | undefined) {
  if (!path) return 'Conflict'

  return basename(path)
}

export function conflictDiffDocumentTitle(path: string | null | undefined) {
  if (!path) return 'Filesystem conflict editor'

  return `${displayConflictPath(path)} conflict editor`
}

function displayConflictPath(path: string) {
  if (path.startsWith('/')) return path

  return displayPath(path)
}
