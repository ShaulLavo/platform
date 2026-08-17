import { basename } from '@/lib/path-formatters'

const COMPARE_SAVED_PREFIX = 'compare-saved:'

/**
 * Document id for "compare the active editor with what is on disk".
 *
 * Unlike a git diff document, this one carries no content: both sides are read live at render time
 * (the buffer from the document store, the saved side from the file cache), so the tab keeps
 * showing the truth as you keep typing instead of freezing a snapshot taken when it opened.
 */
export function compareSavedDocumentId(path: string): string {
  return `${COMPARE_SAVED_PREFIX}${encodeURIComponent(path)}`
}

export function parseCompareSavedDocumentId(id: string | null | undefined): string | null {
  if (!id?.startsWith(COMPARE_SAVED_PREFIX)) return null

  const encoded = id.slice(COMPARE_SAVED_PREFIX.length)
  if (encoded.length === 0) return null

  try {
    const path = decodeURIComponent(encoded)
    return path.length > 0 ? path : null
  } catch {
    // A malformed id is not a compare document; treating it as one would open an empty tab.
    return null
  }
}

export function compareSavedDocumentLabel(id: string): string {
  const path = parseCompareSavedDocumentId(id)
  if (!path) return basename(id)

  return `${basename(path)} (working tree)`
}
