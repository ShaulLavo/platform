import {
  CircleNotchIcon,
  FileTextIcon,
  MagnifyingGlassIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react"
import type { TypeScriptLspDefinitionTarget } from "@editor/typescript-lsp"
import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react"

import { useEditorCommands } from "@/features/editor/state/editor-commands"
import type { FindMatch, FsEntryType } from "@/lib/file-system-types"
import { fsServerUrl } from "@/lib/fs-client"
import { basename, toTreePath } from "@/lib/path-formatters"
import { parseSseStream, type ParsedSseEvent } from "@/lib/sse"
import { Input } from "@workspace/ui/components/input"

const SEARCH_DEBOUNCE_MS = 180
const SEARCH_LIMIT = 200

type WorkspaceSearchMatch = FindMatch & {
  column?: number
  line?: number
  preview?: string
}

type WorkspaceSearchState =
  | {
      matches: WorkspaceSearchMatch[]
      status: "idle"
      truncated: false
    }
  | {
      matches: WorkspaceSearchMatch[]
      status: "loading"
      truncated: false
    }
  | {
      matches: WorkspaceSearchMatch[]
      status: "ready"
      truncated: boolean
    }
  | {
      matches: WorkspaceSearchMatch[]
      message: string
      status: "error"
      truncated: false
    }

type WorkspaceSearchSnapshot = WorkspaceSearchState & {
  query: string
}

type SearchFileResult = {
  matches: WorkspaceSearchMatch[]
  name: string
  path: string
  pathLabel: string
}

type SearchDone = {
  count: number
  truncated: boolean
}

const EMPTY_SEARCH_STATE: WorkspaceSearchState = {
  matches: [],
  status: "idle",
  truncated: false,
}

const EMPTY_SEARCH_SNAPSHOT: WorkspaceSearchSnapshot = {
  ...EMPTY_SEARCH_STATE,
  query: "",
}

const STARTING_SEARCH_STATE: WorkspaceSearchState = {
  matches: [],
  status: "loading",
  truncated: false,
}

export function WorkspaceSearchPane({ rootPath }: { rootPath: string }) {
  const [query, setQuery] = useState("")
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS).trim()
  const searchState = useWorkspaceSearch(rootPath, debouncedQuery)
  const groups = useMemo(
    () => groupSearchMatches(searchState.matches, rootPath),
    [rootPath, searchState.matches]
  )
  const { openDefinition, selectFile } = useEditorCommands()

  function handleQueryChange(event: ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value)
  }

  function openMatch(match: WorkspaceSearchMatch) {
    if (!isContentLocation(match)) {
      selectFile(match.path)
      return
    }

    openDefinition(searchDefinitionTarget(match, debouncedQuery))
  }

  return (
    <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
      <div className="border-b bg-muted/20 p-2">
        <div className="relative">
          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search workspace"
            autoCapitalize="off"
            autoCorrect="off"
            className="h-8 pr-2 pl-8 text-xs"
            placeholder="Search workspace"
            spellCheck={false}
            type="search"
            value={query}
            onChange={handleQueryChange}
          />
        </div>
        <SearchSummary query={debouncedQuery} state={searchState} />
      </div>
      <SearchResults
        groups={groups}
        query={debouncedQuery}
        state={searchState}
        onOpenMatch={openMatch}
      />
    </section>
  )
}

function SearchSummary({
  query,
  state,
}: {
  query: string
  state: WorkspaceSearchState
}) {
  if (!query) return <SearchSummaryText>Find in files</SearchSummaryText>
  if (state.status === "error")
    return <SearchSummaryText>{state.message}</SearchSummaryText>
  if (state.status === "loading" && state.matches.length === 0) {
    return <SearchSummaryText>Searching</SearchSummaryText>
  }

  const suffix = state.truncated ? "shown, limit reached" : "matches"
  return (
    <SearchSummaryText>
      {state.matches.length.toLocaleString()} {suffix}
    </SearchSummaryText>
  )
}

function SearchSummaryText({ children }: { children: string }) {
  return (
    <div className="mt-2 min-h-4 truncate px-1 text-[11px] text-muted-foreground">
      {children}
    </div>
  )
}

function SearchResults({
  groups,
  query,
  state,
  onOpenMatch,
}: {
  groups: SearchFileResult[]
  query: string
  state: WorkspaceSearchState
  onOpenMatch: (match: WorkspaceSearchMatch) => void
}) {
  if (state.status === "idle") {
    return (
      <SearchEmptyState
        description="Search text and filenames in the selected workspace."
        title="Search workspace"
      />
    )
  }
  if (state.status === "error") {
    return <SearchErrorState message={state.message} />
  }
  if (groups.length === 0) return <SearchPendingOrEmpty state={state} />

  return (
    <div className="app-scrollbar-thin min-h-0 overflow-auto">
      <div className="space-y-1 p-1.5">
        {groups.map((group) => (
          <SearchFileGroup
            group={group}
            key={group.path}
            query={query}
            onOpenMatch={onOpenMatch}
          />
        ))}
      </div>
    </div>
  )
}

function SearchPendingOrEmpty({ state }: { state: WorkspaceSearchState }) {
  if (state.status === "loading") {
    return (
      <SearchCenteredState>
        <CircleNotchIcon className="size-4 animate-spin" />
        Searching
      </SearchCenteredState>
    )
  }

  return <SearchEmptyState description="Try a different query." title="No matches" />
}

function SearchFileGroup({
  group,
  query,
  onOpenMatch,
}: {
  group: SearchFileResult
  query: string
  onOpenMatch: (match: WorkspaceSearchMatch) => void
}) {
  return (
    <section className="rounded-md border bg-background">
      <div className="flex min-w-0 items-center gap-2 border-b px-2 py-1.5">
        <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <div className="truncate text-xs font-medium">{group.name}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {group.pathLabel}
          </div>
        </div>
      </div>
      <div className="py-1">
        {group.matches.map((match, index) => (
          <SearchMatchRow
            key={`${match.kind}:${match.path}:${match.line ?? "name"}:${index}`}
            match={match}
            query={query}
            onOpenMatch={onOpenMatch}
          />
        ))}
      </div>
    </section>
  )
}

function SearchMatchRow({
  match,
  query,
  onOpenMatch,
}: {
  match: WorkspaceSearchMatch
  query: string
  onOpenMatch: (match: WorkspaceSearchMatch) => void
}) {
  const location = searchMatchLocation(match)
  const preview = searchMatchPreview(match)

  return (
    <button
      className="grid w-full grid-cols-[42px_minmax(0,1fr)] gap-2 px-2 py-1.5 text-left text-xs outline-none hover:bg-muted/70 focus-visible:ring-1 focus-visible:ring-ring/50"
      type="button"
      onClick={() => onOpenMatch(match)}
    >
      <span className="text-right text-[11px] tabular-nums text-muted-foreground">
        {location}
      </span>
      <span className="min-w-0 truncate font-mono text-[11px] leading-5">
        <HighlightedPreview preview={preview} query={query} />
      </span>
    </button>
  )
}

function HighlightedPreview({
  preview,
  query,
}: {
  preview: string
  query: string
}) {
  const highlight = previewHighlight(preview, query)
  if (!highlight) return <>{preview}</>

  return (
    <>
      {highlight.before}
      <mark className="rounded-sm bg-yellow-200/80 px-0.5 text-yellow-950 dark:bg-yellow-500/30 dark:text-yellow-100">
        {highlight.match}
      </mark>
      {highlight.after}
    </>
  )
}

function SearchEmptyState({
  description,
  title,
}: {
  description: string
  title: string
}) {
  return (
    <SearchCenteredState>
      <MagnifyingGlassIcon className="size-5 text-muted-foreground" />
      <span className="font-medium text-foreground">{title}</span>
      <span className="max-w-48 text-center text-[11px] text-muted-foreground">
        {description}
      </span>
    </SearchCenteredState>
  )
}

function SearchErrorState({ message }: { message: string }) {
  return (
    <div className="flex min-h-0 items-center justify-center p-4">
      <div className="flex max-w-52 flex-col items-center gap-3 text-center text-xs">
        <WarningCircleIcon
          className="size-6 text-destructive"
          weight="duotone"
        />
        <div>
          <div className="font-medium">Search failed</div>
          <p className="mt-1 text-[11px] text-muted-foreground">{message}</p>
        </div>
      </div>
    </div>
  )
}

function SearchCenteredState({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 items-center justify-center p-4 text-xs text-muted-foreground">
      <div className="flex flex-col items-center gap-2">{children}</div>
    </div>
  )
}

function useWorkspaceSearch(rootPath: string, query: string): WorkspaceSearchState {
  const [snapshot, setSnapshot] = useState<WorkspaceSearchSnapshot>(
    EMPTY_SEARCH_SNAPSHOT
  )

  useEffect(() => {
    if (!query) return

    const controller = new AbortController()
    queueSearchStateUpdate(controller.signal, () => {
      setSnapshot({
        matches: [],
        query,
        status: "loading",
        truncated: false,
      })
    })
    void runWorkspaceSearch({
      onDone: (done) => {
        setSnapshot((current) => {
          if (current.query !== query) return current

          return {
            matches: current.matches,
            query,
            status: "ready",
            truncated: done.truncated,
          }
        })
      },
      onMatch: (match) => {
        setSnapshot((current) => {
          if (current.query !== query) return current

          return {
            matches: [...current.matches, match],
            query,
            status: "loading",
            truncated: false,
          }
        })
      },
      query,
      rootPath,
      signal: controller.signal,
    }).catch((error: unknown) => {
      if (isAbortError(error)) return
      setSnapshot({
        matches: [],
        message: errorMessage(error),
        query,
        status: "error",
        truncated: false,
      })
    })

    return () => controller.abort()
  }, [query, rootPath])

  if (!query) return EMPTY_SEARCH_STATE
  if (snapshot.query !== query) return STARTING_SEARCH_STATE

  return snapshot
}

function queueSearchStateUpdate(signal: AbortSignal, update: () => void) {
  queueMicrotask(() => {
    if (signal.aborted) return

    update()
  })
}

async function runWorkspaceSearch({
  onDone,
  onMatch,
  query,
  rootPath,
  signal,
}: {
  onDone: (done: SearchDone) => void
  onMatch: (match: WorkspaceSearchMatch) => void
  query: string
  rootPath: string
  signal: AbortSignal
}) {
  const response = await fetch(workspaceSearchUrl(rootPath, query), { signal })
  if (!response.ok) throw new Error(`Search failed with status ${response.status}.`)
  if (!response.body) throw new Error("Search response did not include a body.")

  for await (const event of parseSseStream(response.body)) {
    if (signal.aborted) return
    if (appendWorkspaceSearchEvent(event, onMatch)) continue
    if (finishWorkspaceSearchEvent(event, onDone)) return
    if (event.event === "error") throw new Error(searchEventError(event.data))
  }
}

function appendWorkspaceSearchEvent(
  event: ParsedSseEvent,
  onMatch: (match: WorkspaceSearchMatch) => void
) {
  if (event.event !== "match") return false

  const match = searchEventMatch(event.data)
  if (!match) return false

  onMatch(match)
  return true
}

function finishWorkspaceSearchEvent(
  event: ParsedSseEvent,
  onDone: (done: SearchDone) => void
) {
  if (event.event !== "done") return false

  onDone(searchDoneEvent(event.data))
  return true
}

function workspaceSearchUrl(rootPath: string, query: string) {
  const url = new URL("/fs/find/events", fsServerUrl)
  url.searchParams.set("entryType", "file")
  url.searchParams.set("includeContent", "true")
  url.searchParams.set("limit", String(SEARCH_LIMIT))
  url.searchParams.set("path", rootPath)
  url.searchParams.set("query", query)
  return url
}

function groupSearchMatches(
  matches: readonly WorkspaceSearchMatch[],
  rootPath: string
) {
  const groups = new Map<string, SearchFileResult>()

  for (const match of matches) {
    const group = groups.get(match.path)
    if (group) {
      group.matches.push(match)
      continue
    }

    groups.set(match.path, {
      matches: [match],
      name: basename(match.path),
      path: match.path,
      pathLabel: toTreePath(match.path, rootPath),
    })
  }

  return [...groups.values()].sort((a, b) => a.pathLabel.localeCompare(b.pathLabel))
}

function searchMatchLocation(match: WorkspaceSearchMatch) {
  if (match.kind === "name") return "file"
  if (match.line === undefined) return ""

  return String(match.line)
}

function searchMatchPreview(match: WorkspaceSearchMatch) {
  if (match.kind === "name") return "Filename matches"

  return match.preview || "Matched line"
}

function isContentLocation(
  match: WorkspaceSearchMatch
): match is WorkspaceSearchMatch & { column: number; line: number } {
  if (match.kind !== "content") return false
  if (typeof match.line !== "number") return false

  return typeof match.column === "number"
}

function searchDefinitionTarget(
  match: WorkspaceSearchMatch & { column: number; line: number },
  query: string
): TypeScriptLspDefinitionTarget {
  const line = Math.max(0, match.line - 1)
  const character = Math.max(0, match.column - 1)
  const endCharacter = character + Math.max(1, query.length)

  return {
    path: match.path,
    range: {
      end: { character: endCharacter, line },
      start: { character, line },
    },
    uri: fileUriForPath(match.path),
  }
}

function previewHighlight(preview: string, query: string) {
  const normalizedPreview = preview.toLocaleLowerCase()
  const normalizedQuery = query.toLocaleLowerCase()
  const index = normalizedPreview.indexOf(normalizedQuery)
  if (index < 0) return null

  const end = index + query.length
  return {
    after: preview.slice(end),
    before: preview.slice(0, index),
    match: preview.slice(index, end),
  }
}

function searchEventMatch(data: unknown): WorkspaceSearchMatch | null {
  if (!data || typeof data !== "object") return null
  if (!("match" in data)) return null
  if (!isWorkspaceSearchMatch(data.match)) return null

  return data.match
}

function isWorkspaceSearchMatch(match: unknown): match is WorkspaceSearchMatch {
  if (!match || typeof match !== "object") return false
  if (!("kind" in match) || !isSearchKind(match.kind)) return false
  if (!("path" in match) || typeof match.path !== "string") return false
  if (!("type" in match) || !isFsEntryType(match.type)) return false
  if ("targetType" in match && !isOptionalFsEntryType(match.targetType))
    return false
  if ("line" in match && !isOptionalNumber(match.line)) return false
  if ("column" in match && !isOptionalNumber(match.column)) return false

  return !("preview" in match) || isOptionalString(match.preview)
}

function searchDoneEvent(data: unknown): SearchDone {
  if (!data || typeof data !== "object") return { count: 0, truncated: false }

  return {
    count: propertyNumber(data, "count"),
    truncated: propertyBoolean(data, "truncated"),
  }
}

function searchEventError(data: unknown) {
  if (!data || typeof data !== "object") return "Search failed."
  if (!("error" in data)) return "Search failed."

  return errorMessage(data.error)
}

function isSearchKind(kind: unknown) {
  return kind === "name" || kind === "content"
}

function isOptionalFsEntryType(type: unknown): type is FsEntryType | undefined {
  if (type === undefined) return true

  return isFsEntryType(type)
}

function isFsEntryType(type: unknown): type is FsEntryType {
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

function propertyNumber(value: object, key: string) {
  const item = (value as Record<string, unknown>)[key]
  return typeof item === "number" ? item : 0
}

function propertyBoolean(value: object, key: string) {
  return (value as Record<string, unknown>)[key] === true
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  if (!error || typeof error !== "object") return "Search failed."
  if (!("message" in error)) return "Search failed."

  return typeof error.message === "string" ? error.message : "Search failed."
}

function isAbortError(error: unknown) {
  if (!error || typeof error !== "object") return false
  if (!("name" in error)) return false

  return error.name === "AbortError"
}

function fileUriForPath(path: string) {
  const normalized = path.replace(/^\/+/, "")
  return `file:///${normalized.split("/").map(encodeURIComponent).join("/")}`
}

function useDebouncedValue(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [delay, value])

  return debounced
}
