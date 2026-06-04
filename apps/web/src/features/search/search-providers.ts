import {
  createWorkspaceSearchMatcher,
  errorNumberField,
  errorStringField,
  type WorkspaceSearchMatcher,
  type WorkspaceSearchTextMatch,
  type WorkspaceSearchDoneEvent,
  type WorkspaceSearchEvent,
  type WorkspaceSearchMatch,
  type WorkspaceSearchQuery,
  workspaceSearchPreview,
} from '@workspace/contracts'

import { log } from '@/lib/client-logging'
import { streamWorkspaceSearch } from '@/lib/workspace-search-client'
import { compareSearchPaths } from '@/features/search/search-sort'

export type SearchProvider = {
  search(query: WorkspaceSearchQuery, signal?: AbortSignal): AsyncIterable<WorkspaceSearchEvent>
}

export type OpenBufferSearchDocument = {
  path: string
  text: string
}

export class DiskSearchProvider implements SearchProvider {
  async *search(
    query: WorkspaceSearchQuery,
    signal?: AbortSignal,
  ): AsyncGenerator<WorkspaceSearchEvent> {
    yield* streamWorkspaceSearch({ ...query, entryType: query.entryType ?? 'file' }, signal)
  }
}

export class OpenBufferSearchProvider implements SearchProvider {
  private documents: readonly OpenBufferSearchDocument[]

  constructor(documents: readonly OpenBufferSearchDocument[]) {
    this.documents = documents.toSorted((a, b) => compareSearchPaths(a.path, b.path))
  }

  async *search(
    query: WorkspaceSearchQuery,
    signal?: AbortSignal,
  ): AsyncGenerator<WorkspaceSearchEvent> {
    let count = 0
    let truncated = false
    const matcher = createWorkspaceSearchMatcher(query)

    for (const document of this.documents) {
      if (signal?.aborted) return
      if (!canSearchOpenBuffer(document, query, matcher)) continue

      for (const match of openBufferMatches(document, matcher)) {
        if (count >= query.limit) {
          truncated = true
          break
        }

        count += 1
        yield { match, type: 'match' }
      }

      if (truncated) break
    }

    yield doneEvent(query, count, truncated)
  }
}

export class CompositeSearchProvider implements SearchProvider {
  private disk: SearchProvider
  private openBuffers: SearchProvider
  private openBufferPaths: ReadonlySet<string>

  constructor({
    disk,
    openBuffers,
    openBufferPaths,
  }: {
    disk: SearchProvider
    openBuffers: SearchProvider
    openBufferPaths: ReadonlySet<string>
  }) {
    this.disk = disk
    this.openBuffers = openBuffers
    this.openBufferPaths = openBufferPaths
  }

  async *search(
    query: WorkspaceSearchQuery,
    signal?: AbortSignal,
  ): AsyncGenerator<WorkspaceSearchEvent> {
    const state = createCompositeState()
    const startedAt = performance.now()

    try {
      yield* this.searchOpenBuffers(query, state, signal)
      if (shouldStopCompositeSearch(query, state, signal)) {
        logSearchCompleted(query, state, true, startedAt)
        yield doneEvent(query, state.emittedCount, true)
        return
      }

      yield* this.searchDisk(query, state, signal)
      logSearchCompleted(query, state, state.truncated, startedAt)
      yield doneEvent(query, state.emittedCount, state.truncated)
    } catch (error) {
      if (!signal?.aborted) logSearchFailed(query, error, startedAt)

      throw error
    }
  }

  private async *searchOpenBuffers(
    query: WorkspaceSearchQuery,
    state: CompositeSearchState,
    signal?: AbortSignal,
  ) {
    for await (const event of this.openBuffers.search(query, signal)) {
      if (appendCompositeEvent(event, state, query.limit)) yield event
      if (state.emittedCount >= query.limit) return
    }
  }

  private async *searchDisk(
    query: WorkspaceSearchQuery,
    state: CompositeSearchState,
    signal?: AbortSignal,
  ) {
    const diskQuery = { ...query, limit: query.limit }

    for await (const event of this.disk.search(diskQuery, signal)) {
      if (!shouldEmitDiskEvent(event, this.openBufferPaths)) continue

      if (appendCompositeEvent(event, state, query.limit)) yield event
      if (state.emittedCount >= query.limit) return
    }
  }
}

type CompositeSearchState = {
  emittedCount: number
  truncated: boolean
}

function createCompositeState(): CompositeSearchState {
  return { emittedCount: 0, truncated: false }
}

function logSearchCompleted(
  query: WorkspaceSearchQuery,
  state: CompositeSearchState,
  truncated: boolean,
  startedAt: number,
) {
  log.info({
    ...searchLogContext(query, startedAt),
    action: 'search.query',
    matchCount: state.emittedCount,
    outcome: 'ok',
    truncated,
  })
}

function logSearchFailed(query: WorkspaceSearchQuery, error: unknown, startedAt: number) {
  log.warn({
    ...searchLogContext(query, startedAt),
    action: 'search.query',
    error: searchErrorSummary(error),
    outcome: 'error',
  })
}

function searchLogContext(query: WorkspaceSearchQuery, startedAt: number) {
  return {
    area: 'search',
    durationMs: elapsedMs(startedAt),
    includeContent: query.includeContent === true,
    includeNames: query.includeNames ?? true,
    matchMode: query.matchMode ?? 'literal',
    path: query.path,
    queryLength: query.query.length,
  }
}

function searchErrorSummary(error: unknown) {
  if (error instanceof Error) {
    return {
      code: errorStringField(error, 'code'),
      message: error.message,
      name: error.name,
      status: errorNumberField(error, 'statusCode') ?? errorNumberField(error, 'status'),
    }
  }

  return {
    message: String(error),
    name: typeof error,
  }
}

function elapsedMs(startedAt: number) {
  return Math.round((performance.now() - startedAt) * 100) / 100
}

function shouldStopCompositeSearch(
  query: WorkspaceSearchQuery,
  state: CompositeSearchState,
  signal?: AbortSignal,
) {
  if (signal?.aborted) return true

  return state.emittedCount >= query.limit
}

function appendCompositeEvent(
  event: WorkspaceSearchEvent,
  state: CompositeSearchState,
  limit: number,
) {
  if (event.type === 'done') {
    state.truncated = state.truncated || event.truncated
    return false
  }

  if (state.emittedCount >= limit) return false
  state.emittedCount += 1
  return true
}

function shouldEmitDiskEvent(event: WorkspaceSearchEvent, openBufferPaths: ReadonlySet<string>) {
  if (event.type !== 'match') return true
  if (event.match.kind !== 'content') return true
  if (event.match.source !== 'disk') return true

  return !openBufferPaths.has(event.match.path)
}

function doneEvent(
  query: WorkspaceSearchQuery,
  count: number,
  truncated: boolean,
): WorkspaceSearchDoneEvent {
  return {
    count,
    path: query.path,
    query: query.query,
    truncated,
    type: 'done',
  }
}

function openBufferMatches(document: OpenBufferSearchDocument, matcher: WorkspaceSearchMatcher) {
  const matches: WorkspaceSearchMatch[] = []
  const lines = document.text.split(/\r\n|\r|\n/u)

  for (const [index, line] of lines.entries()) {
    for (const match of matcher.lineMatches(line)) {
      matches.push(openBufferMatch(document.path, line, index, match))
    }
  }

  return matches
}

function openBufferMatch(
  path: string,
  line: string,
  lineIndex: number,
  match: WorkspaceSearchTextMatch,
): WorkspaceSearchMatch {
  const preview = workspaceSearchPreview(line, match.start, match.end)

  return {
    column: match.start + 1,
    endColumn: match.end + 1,
    kind: 'content',
    line: lineIndex + 1,
    path,
    preview: preview.text,
    previewStartColumn: preview.startColumn,
    source: 'open-buffer',
    type: 'file',
  }
}

function canSearchOpenBuffer(
  document: OpenBufferSearchDocument,
  query: WorkspaceSearchQuery,
  matcher: WorkspaceSearchMatcher,
) {
  if (!query.includeContent) return false
  if (query.entryType && query.entryType !== 'file') return false
  if (!isPathInWorkspace(document.path, query.path)) return false
  if (!matcher.pathMatches(globMatchPath(query.path, document.path))) return false

  return true
}

function isPathInWorkspace(path: string, rootPath: string) {
  if (!rootPath) return true
  if (path === rootPath) return true

  return path.startsWith(`${rootPath}/`)
}

function globMatchPath(rootPath: string, path: string) {
  if (!rootPath) return path
  if (path === rootPath) return ''

  const prefix = `${rootPath}/`
  if (!path.startsWith(prefix)) return path

  return path.slice(prefix.length)
}
