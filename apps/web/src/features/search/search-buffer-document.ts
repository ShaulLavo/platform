import { displayPath } from '@/lib/path-formatters'

const SEARCH_BUFFER_DOCUMENT_PREFIX = 'search-buffer:'

export type SearchBufferDocumentInfo = {
  id: string
  rootPath: string
}

export function searchBufferDocumentId(rootPath: string) {
  return `${SEARCH_BUFFER_DOCUMENT_PREFIX}${encodeURIComponent(rootPath)}`
}

export function parseSearchBufferDocumentId(
  id: string | null | undefined,
): SearchBufferDocumentInfo | null {
  if (!id?.startsWith(SEARCH_BUFFER_DOCUMENT_PREFIX)) return null

  try {
    const rootPath = decodeURIComponent(id.slice(SEARCH_BUFFER_DOCUMENT_PREFIX.length))
    if (!rootPath) return null

    return { id, rootPath }
  } catch {
    return null
  }
}

export function searchBufferDocumentLabel() {
  return 'Search'
}

export function searchBufferDocumentTitle(rootPath: string) {
  return `${displayPath(rootPath)} search results`
}
