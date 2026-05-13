import {
  createWorkspaceSearchMatcher,
  type EntryTypeFilter,
  type WorkspaceSearchMatcher,
  type WorkspaceSearchTextMatch,
  type WorkspaceSearchDoneEvent,
  type WorkspaceSearchEvent,
  type WorkspaceSearchMatch,
  type WorkspaceSearchQuery,
} from "@workspace/contracts"

import { fsServerUrl } from "@/lib/fs-client"
import { parseSseStream, type ParsedSseEvent } from "@/lib/sse"

const SEARCH_PREVIEW_CONTEXT_CHARS = 80
const SEARCH_PREVIEW_MAX_CHARS = 240

export type SearchProvider = {
  search(
    query: WorkspaceSearchQuery,
    signal?: AbortSignal
  ): AsyncIterable<WorkspaceSearchEvent>
}

export type OpenBufferSearchDocument = {
  path: string
  text: string
}

export class DiskSearchProvider implements SearchProvider {
  async *search(
    query: WorkspaceSearchQuery,
    signal?: AbortSignal
  ): AsyncGenerator<WorkspaceSearchEvent> {
    const response = await fetch(workspaceSearchUrl(query), { signal })
    if (!response.ok)
      throw new Error(`Search failed with status ${response.status}.`)
    if (!response.body)
      throw new Error("Search response did not include a body.")

    for await (const event of parseSseStream(response.body)) {
      if (signal?.aborted) return

      yield searchEventFromSse(event)
    }
  }
}

export class OpenBufferSearchProvider implements SearchProvider {
  private documents: readonly OpenBufferSearchDocument[]

  constructor(documents: readonly OpenBufferSearchDocument[]) {
    this.documents = [...documents].sort((a, b) => a.path.localeCompare(b.path))
  }

  async *search(
    query: WorkspaceSearchQuery,
    signal?: AbortSignal
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
        yield { match, type: "match" }
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
    signal?: AbortSignal
  ): AsyncGenerator<WorkspaceSearchEvent> {
    const state = createCompositeState()

    yield* this.searchOpenBuffers(query, state, signal)
    if (shouldStopCompositeSearch(query, state, signal)) {
      yield doneEvent(query, state.count, true)
      return
    }

    yield* this.searchDisk(query, state, signal)
    yield doneEvent(query, state.count, state.truncated)
  }

  private async *searchOpenBuffers(
    query: WorkspaceSearchQuery,
    state: CompositeSearchState,
    signal?: AbortSignal
  ) {
    for await (const event of this.openBuffers.search(query, signal)) {
      if (appendCompositeEvent(event, state, query.limit)) yield event
      if (state.count >= query.limit) return
    }
  }

  private async *searchDisk(
    query: WorkspaceSearchQuery,
    state: CompositeSearchState,
    signal?: AbortSignal
  ) {
    const diskQuery = { ...query, limit: query.limit - state.count }

    for await (const event of this.disk.search(diskQuery, signal)) {
      if (!shouldEmitDiskEvent(event, this.openBufferPaths)) {
        trackCompositeEvent(event, state)
        continue
      }

      if (appendCompositeEvent(event, state, query.limit)) yield event
      if (state.count >= query.limit) return
    }
  }
}

type CompositeSearchState = {
  count: number
  truncated: boolean
}

function createCompositeState(): CompositeSearchState {
  return { count: 0, truncated: false }
}

function shouldStopCompositeSearch(
  query: WorkspaceSearchQuery,
  state: CompositeSearchState,
  signal?: AbortSignal
) {
  if (signal?.aborted) return true

  return state.count >= query.limit
}

function appendCompositeEvent(
  event: WorkspaceSearchEvent,
  state: CompositeSearchState,
  limit: number
) {
  trackCompositeEvent(event, state)
  if (event.type !== "match") return false
  if (state.count > limit) return false

  return true
}

function trackCompositeEvent(
  event: WorkspaceSearchEvent,
  state: CompositeSearchState
) {
  if (event.type === "done") {
    state.truncated = state.truncated || event.truncated
    return
  }

  if (event.type === "match") state.count += 1
}

function shouldEmitDiskEvent(
  event: WorkspaceSearchEvent,
  openBufferPaths: ReadonlySet<string>
) {
  if (event.type !== "match") return true
  if (event.match.kind !== "content") return true
  if (event.match.source !== "disk") return true

  return !openBufferPaths.has(event.match.path)
}

function workspaceSearchUrl(query: WorkspaceSearchQuery) {
  const url = new URL("/fs/find/events", fsServerUrl)
  url.searchParams.set("entryType", query.entryType ?? "file")
  url.searchParams.set("includeContent", String(query.includeContent))
  if (query.includeNames !== undefined) {
    url.searchParams.set("includeNames", String(query.includeNames))
  }
  url.searchParams.set("limit", String(query.limit))
  url.searchParams.set("path", query.path)
  url.searchParams.set("query", query.query)
  url.searchParams.set("caseSensitive", String(query.caseSensitive === true))
  url.searchParams.set("matchMode", query.matchMode ?? "literal")
  url.searchParams.set("wholeWord", String(query.wholeWord === true))
  for (const glob of query.includeGlobs ?? []) {
    url.searchParams.append("includeGlobs", glob)
  }
  for (const glob of query.excludeGlobs ?? []) {
    url.searchParams.append("excludeGlobs", glob)
  }
  if (query.maxDepth !== undefined) {
    url.searchParams.set("maxDepth", String(query.maxDepth))
  }

  return url
}

function searchEventFromSse(event: ParsedSseEvent): WorkspaceSearchEvent {
  if (event.event === "match") return matchEvent(event.data)
  if (event.event === "done") return doneEventFromData(event.data)
  if (event.event === "error") throw new Error(searchEventError(event.data))

  throw new Error(`Unexpected search event: ${event.event}`)
}

function matchEvent(data: unknown): WorkspaceSearchEvent {
  const match = searchEventMatch(data)
  if (!match) throw new Error("Search response included an invalid match.")

  return { match, type: "match" }
}

function searchEventMatch(data: unknown): WorkspaceSearchMatch | null {
  if (!isRecord(data)) return null
  if (!isWorkspaceSearchMatch(data.match)) return null

  return data.match
}

function doneEventFromData(data: unknown): WorkspaceSearchDoneEvent {
  if (!isRecord(data)) {
    return { count: 0, path: "", query: "", truncated: false, type: "done" }
  }

  return {
    count: propertyNumber(data, "count"),
    path: propertyString(data, "path"),
    query: propertyString(data, "query"),
    truncated: propertyBoolean(data, "truncated"),
    type: "done",
  }
}

function doneEvent(
  query: WorkspaceSearchQuery,
  count: number,
  truncated: boolean
): WorkspaceSearchDoneEvent {
  return {
    count,
    path: query.path,
    query: query.query,
    truncated,
    type: "done",
  }
}

function openBufferMatches(
  document: OpenBufferSearchDocument,
  matcher: WorkspaceSearchMatcher
) {
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
  match: WorkspaceSearchTextMatch
): WorkspaceSearchMatch {
  const preview = searchPreview(line, match.start)

  return {
    column: match.start + 1,
    endColumn: match.end + 1,
    kind: "content",
    line: lineIndex + 1,
    path,
    preview: preview.text,
    previewStartColumn: preview.startColumn,
    source: "open-buffer",
    type: "file",
  }
}

function searchPreview(line: string, columnIndex: number) {
  if (line.length <= SEARCH_PREVIEW_MAX_CHARS) {
    return { startColumn: 0, text: line }
  }

  const latestStart = Math.max(0, line.length - SEARCH_PREVIEW_MAX_CHARS)
  const preferredStart = Math.max(0, columnIndex - SEARCH_PREVIEW_CONTEXT_CHARS)
  const startColumn = Math.min(preferredStart, latestStart)

  return {
    startColumn,
    text: line.slice(startColumn, startColumn + SEARCH_PREVIEW_MAX_CHARS),
  }
}

function canSearchOpenBuffer(
  document: OpenBufferSearchDocument,
  query: WorkspaceSearchQuery,
  matcher: WorkspaceSearchMatcher
) {
  if (!query.includeContent) return false
  if (query.entryType && query.entryType !== "file") return false
  if (!isPathInWorkspace(document.path, query.path)) return false
  if (!matcher.pathMatches(globMatchPath(query.path, document.path)))
    return false

  return true
}

function isWorkspaceSearchMatch(match: unknown): match is WorkspaceSearchMatch {
  if (!isRecord(match)) return false
  if (!isSearchKind(match.kind)) return false
  if (!isSearchSource(match.source)) return false
  if (typeof match.path !== "string") return false
  if (!isEntryType(match.type)) return false
  if (!isOptionalEntryType(match.targetType)) return false
  if (!isOptionalNumber(match.line)) return false
  if (!isOptionalNumber(match.column)) return false
  if (!isOptionalNumber(match.endColumn)) return false
  if (!isOptionalNumber(match.previewStartColumn)) return false

  return isOptionalString(match.preview)
}

function isSearchKind(kind: unknown) {
  return kind === "name" || kind === "content"
}

function isSearchSource(source: unknown) {
  return source === "disk" || source === "open-buffer"
}

function isOptionalEntryType(
  type: unknown
): type is EntryTypeFilter | undefined {
  if (type === undefined) return true

  return isEntryType(type)
}

function isEntryType(type: unknown): type is EntryTypeFilter {
  return (
    type === "file" ||
    type === "directory" ||
    type === "symlink" ||
    type === "other"
  )
}

function isOptionalNumber(value: unknown) {
  if (value === undefined) return true

  return typeof value === "number"
}

function isOptionalString(value: unknown) {
  if (value === undefined) return true

  return typeof value === "string"
}

function searchEventError(data: unknown) {
  if (!isRecord(data)) return "Search failed."
  if (isRecord(data.error) && typeof data.error.message === "string")
    return data.error.message
  if (typeof data.message === "string") return data.message

  return "Search failed."
}

function propertyNumber(data: Record<string, unknown>, key: string) {
  return typeof data[key] === "number" ? data[key] : 0
}

function propertyBoolean(data: Record<string, unknown>, key: string) {
  return data[key] === true
}

function propertyString(data: Record<string, unknown>, key: string) {
  return typeof data[key] === "string" ? data[key] : ""
}

function isPathInWorkspace(path: string, rootPath: string) {
  if (!rootPath) return true
  if (path === rootPath) return true

  return path.startsWith(`${rootPath}/`)
}

function globMatchPath(rootPath: string, path: string) {
  if (!rootPath) return path
  if (path === rootPath) return ""

  const prefix = `${rootPath}/`
  if (!path.startsWith(prefix)) return path

  return path.slice(prefix.length)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
