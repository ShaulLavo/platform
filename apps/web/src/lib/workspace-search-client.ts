import type {
  EntryTypeFilter,
  WorkspaceSearchDoneEvent,
  WorkspaceSearchEvent,
  WorkspaceSearchMatch,
  WorkspaceSearchQuery,
} from '@workspace/contracts'

import { getClient } from '@/lib/client'
import { parseEdenSseStream, type EdenSseEvent } from '@/lib/eden-events'
import { clientErrors } from '@/lib/structured-errors'

export type WorkspaceSearchResult = {
  count: number
  matches: WorkspaceSearchMatch[]
  path: string
  query: string
  truncated: boolean
}

export async function collectWorkspaceSearch(
  query: WorkspaceSearchQuery,
  signal?: AbortSignal,
): Promise<WorkspaceSearchResult> {
  const matches: WorkspaceSearchMatch[] = []
  let done: WorkspaceSearchDoneEvent | null = null

  for await (const event of streamWorkspaceSearch(query, signal)) {
    if (event.type === 'match') {
      matches.push(event.match)
      continue
    }

    done = event
  }

  return {
    count: done?.count ?? matches.length,
    matches,
    path: done?.path ?? query.path,
    query: done?.query ?? query.query,
    truncated: done?.truncated ?? false,
  }
}

export async function* streamWorkspaceSearch(
  query: WorkspaceSearchQuery,
  signal?: AbortSignal,
): AsyncGenerator<WorkspaceSearchEvent> {
  const response = await getClient().fs.search.events.get({
    query: workspaceSearchRequestQuery(query),
    fetch: { signal },
  })
  if (response.error) throw clientErrors.SEARCH_FAILED({ status: response.status })
  if (!response.data) throw clientErrors.EDEN_STREAM_MISSING({ label: 'Search' })

  for await (const event of parseEdenSseStream(response.data)) {
    if (signal?.aborted) return

    yield workspaceSearchEventFromSse(event)
  }
}

function workspaceSearchRequestQuery(query: WorkspaceSearchQuery) {
  return {
    caseSensitive: query.caseSensitive === true,
    entryType: query.entryType,
    excludeGlobs: query.excludeGlobs ? Array.from(query.excludeGlobs) : undefined,
    includeContent: query.includeContent === true,
    includeGlobs: query.includeGlobs ? Array.from(query.includeGlobs) : undefined,
    includeNames: query.includeNames ?? true,
    limit: query.limit,
    matchMode: query.matchMode ?? 'literal',
    maxDepth: query.maxDepth,
    path: query.path,
    query: query.query,
    wholeWord: query.wholeWord === true,
  }
}

function workspaceSearchEventFromSse(event: EdenSseEvent): WorkspaceSearchEvent {
  if (event.event === 'match') return matchEvent(event.data)
  if (event.event === 'done') return doneEventFromData(event.data)
  if (event.event === 'error') {
    throw clientErrors.SEARCH_EVENT_ERROR({ message: searchEventError(event.data) })
  }

  throw clientErrors.UNEXPECTED_SEARCH_EVENT({ event: event.event })
}

function matchEvent(data: unknown): WorkspaceSearchEvent {
  const match = searchEventMatch(data)
  if (!match) throw clientErrors.SEARCH_MATCH_INVALID()

  return { match, type: 'match' }
}

function searchEventMatch(data: unknown): WorkspaceSearchMatch | null {
  if (!isRecord(data)) return null
  if (!isWorkspaceSearchMatch(data.match)) return null

  return data.match
}

function doneEventFromData(data: unknown): WorkspaceSearchDoneEvent {
  if (!isRecord(data)) {
    return { count: 0, path: '', query: '', truncated: false, type: 'done' }
  }

  return {
    count: propertyNumber(data, 'count'),
    path: propertyString(data, 'path'),
    query: propertyString(data, 'query'),
    truncated: propertyBoolean(data, 'truncated'),
    type: 'done',
  }
}

function isWorkspaceSearchMatch(match: unknown): match is WorkspaceSearchMatch {
  if (!isRecord(match)) return false
  if (!isSearchKind(match.kind)) return false
  if (!isSearchSource(match.source)) return false
  if (typeof match.path !== 'string') return false
  if (!isEntryType(match.type)) return false
  if (!isOptionalEntryType(match.targetType)) return false
  if (!isOptionalNumber(match.line)) return false
  if (!isOptionalNumber(match.column)) return false
  if (!isOptionalNumber(match.endColumn)) return false
  if (!isOptionalNumber(match.previewStartColumn)) return false
  if (!isOptionalNumber(match.size)) return false
  if (!isOptionalNumber(match.mtimeMs)) return false
  if (!isOptionalNumber(match.birthtimeMs)) return false

  return isOptionalString(match.preview)
}

function isSearchKind(kind: unknown) {
  return kind === 'name' || kind === 'content'
}

function isSearchSource(source: unknown) {
  return source === 'disk' || source === 'open-buffer'
}

function isOptionalEntryType(type: unknown): type is EntryTypeFilter | undefined {
  if (type === undefined) return true

  return isEntryType(type)
}

function isEntryType(type: unknown): type is EntryTypeFilter {
  return type === 'file' || type === 'directory' || type === 'symlink' || type === 'other'
}

function isOptionalNumber(value: unknown) {
  if (value === undefined) return true

  return typeof value === 'number'
}

function isOptionalString(value: unknown) {
  if (value === undefined) return true

  return typeof value === 'string'
}

function searchEventError(data: unknown) {
  if (!isRecord(data)) return 'Search failed.'
  if (isRecord(data.error) && typeof data.error.message === 'string') return data.error.message
  if (typeof data.message === 'string') return data.message

  return 'Search failed.'
}

function propertyNumber(data: Record<string, unknown>, key: string) {
  return typeof data[key] === 'number' ? data[key] : 0
}

function propertyBoolean(data: Record<string, unknown>, key: string) {
  return data[key] === true
}

function propertyString(data: Record<string, unknown>, key: string) {
  return typeof data[key] === 'string' ? data[key] : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
