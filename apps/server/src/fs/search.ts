import { spawn } from "node:child_process"
import { createReadStream } from "node:fs"
import { readdir, stat } from "node:fs/promises"
import path from "node:path"
import type { Readable } from "node:stream"
import { FsError, mapNodeError } from "./errors"
import {
  defaultIgnoredNames,
  isIgnoredPath,
  toPosix,
  type WorkspacePaths,
} from "./path"
import {
  assertDirectory,
  isDirectoryEntry,
  isFileEntry,
  matchesEntryType,
  readEntryStats,
  type FsEntryTypeCarrier,
} from "./stat"
import type { EntryTypeFilter } from "./contracts"
import {
  compareFuzzyRankedTargets,
  createWorkspaceSearchMatcher,
  type WorkspaceSearchMatcher,
  type WorkspaceSearchDoneEvent,
  type WorkspaceSearchMatch,
  type WorkspaceSearchQuery,
} from "@workspace/contracts"

export const SEARCH_LINE_BUFFER_BYTES = 65_536
const SEARCH_PREVIEW_CONTEXT_CHARS = 80
const SEARCH_PREVIEW_MAX_CHARS = 240

export type FindOptions = WorkspaceSearchQuery & {
  maxContentBytes: number
}

export type FindMatch = WorkspaceSearchMatch

export type FindResult = {
  query: string
  path: string
  matches: FindMatch[]
}

export type FindStreamEvent =
  | {
      type: "match"
      match: FindMatch
    }
  | WorkspaceSearchDoneEvent

export type SearchProvider = {
  search(
    query: FindOptions,
    signal?: AbortSignal
  ): AsyncIterable<FindStreamEvent>
}

type FindContext = {
  root: {
    absolutePath: string
    relativePath: string
  }
  query: string
  matcher: WorkspaceSearchMatcher
  options: FindOptions
}

type SearchState = {
  count: number
  truncated: boolean
}

const commandAvailability = new Map<string, Promise<boolean>>()

export class DiskWorkspaceSearchProvider implements SearchProvider {
  private paths: WorkspacePaths

  constructor(paths: WorkspacePaths) {
    this.paths = paths
  }

  search(query: FindOptions, signal?: AbortSignal) {
    return searchWorkspaceWithDiskTools(this.paths, query, signal)
  }
}

export async function findInWorkspace(
  paths: WorkspacePaths,
  options: FindOptions
): Promise<FindResult> {
  const matches: FindMatch[] = []
  let resultPath = options.path

  for await (const event of findInWorkspaceStream(paths, options)) {
    if (event.type === "done") {
      resultPath = event.path
      continue
    }

    if (event.type === "match") matches.push(event.match)
  }

  return {
    query: options.query,
    path: resultPath,
    matches,
  }
}

export async function* findInWorkspaceStream(
  paths: WorkspacePaths,
  options: FindOptions,
  signal?: AbortSignal
): AsyncGenerator<FindStreamEvent> {
  const provider = new DiskWorkspaceSearchProvider(paths)

  yield* provider.search(options, signal)
}

async function* searchWorkspaceWithDiskTools(
  paths: WorkspacePaths,
  options: FindOptions,
  signal?: AbortSignal
): AsyncGenerator<FindStreamEvent> {
  if (signal?.aborted) return

  const context = await createFindContext(paths, options)
  const matches = searchWithTools(paths, context, signal)
  const state: SearchState = { count: 0, truncated: false }

  for await (const match of matches) {
    if (state.count >= options.limit) {
      state.truncated = true
      break
    }

    state.count += 1
    yield { type: "match", match }
  }

  yield {
    count: state.count,
    path: context.root.relativePath,
    query: context.query,
    truncated: state.truncated,
    type: "done",
  }
}

async function createFindContext(
  paths: WorkspacePaths,
  options: FindOptions
): Promise<FindContext> {
  const root = paths.resolve(options.path)

  if (!options.query) throw new FsError("INVALID_PATH", "query is required")

  try {
    const stats = await stat(root.absolutePath)
    assertDirectory(stats)

    return {
      query: options.query,
      matcher: createWorkspaceSearchMatcher(options),
      options,
      root,
    }
  } catch (error) {
    if (error instanceof FsError) throw error
    throw mapNodeError(error)
  }
}

async function* searchWithTools(
  paths: WorkspacePaths,
  context: FindContext,
  signal?: AbortSignal
): AsyncGenerator<FindMatch> {
  if (!(await canUseTools(context.options))) {
    // TODO: remove this fallback after fd/rg installation or tool discovery is guaranteed.
    yield* searchWithFallback(context)
    return
  }

  if (shouldSearchNames(context.options)) {
    yield* searchNamesWithFd(paths, context, signal)
  }
  if (!shouldSearchContent(context.options)) return

  yield* searchContentWithRg(paths, context, signal)
}

async function canUseTools(options: FindOptions) {
  if (shouldSearchNames(options) && !(await commandExists("fd"))) return false
  if (!shouldSearchContent(options)) return true

  return commandExists("rg")
}

function commandExists(command: string) {
  const existing = commandAvailability.get(command)
  if (existing) return existing

  const availability = checkCommand(command)
  commandAvailability.set(command, availability)
  return availability
}

function checkCommand(command: string) {
  return new Promise<boolean>((resolve) => {
    const child = spawn(command, ["--version"], { stdio: "ignore" })
    child.once("error", () => resolve(false))
    child.once("close", (code) => resolve(code === 0))
  })
}

async function* searchNamesWithFd(
  paths: WorkspacePaths,
  context: FindContext,
  signal?: AbortSignal
): AsyncGenerator<FindMatch> {
  const args = fdArgs(context)
  const matches: FindMatch[] = []

  for await (const line of runToolLines("fd", args, signal, [0])) {
    const relativePath = resultPath(context.root.relativePath, line)
    const match = await nameMatchFromPath(
      paths,
      relativePath,
      context,
      context.options.entryType
    )
    if (!match) continue
    matches.push(match)
  }

  if (signal?.aborted) return

  for (const match of rankedNameMatches(matches, context.query)) {
    yield match
  }
}

function rankedNameMatches(matches: readonly FindMatch[], query: string) {
  return matches
    .slice()
    .sort((left, right) =>
      compareFuzzyRankedTargets(
        searchRankTarget(left.path),
        searchRankTarget(right.path),
        query
      )
    )
}

function searchRankTarget(pathname: string) {
  return {
    label: path.basename(pathname),
    path: pathname,
  }
}

async function* searchContentWithRg(
  paths: WorkspacePaths,
  context: FindContext,
  signal?: AbortSignal
): AsyncGenerator<FindMatch> {
  const args = rgArgs(context)

  for await (const line of runToolLines("rg", args, signal, [0, 1], [2])) {
    const matches = await contentMatchesFromJson(paths, context, line)
    for (const match of matches) yield match
  }
}

function fdArgs(context: FindContext) {
  const args = [
    "--base-directory",
    context.root.absolutePath,
    "--follow",
    "--hidden",
    "--no-ignore",
    "--path-separator",
    "/",
  ]

  if (searchMatchMode(context.options) === "literal") {
    args.push("--fixed-strings")
  }
  if (!context.options.caseSensitive) args.push("--ignore-case")

  const type = fdType(context.options.entryType)
  if (type) args.push("--type", type)
  if (context.options.maxDepth !== undefined)
    args.push("--max-depth", String(context.options.maxDepth))

  for (const ignored of defaultIgnoredNames) args.push("--exclude", ignored)

  args.push(context.query)
  return args
}

function rgArgs(context: FindContext) {
  const args = [
    "--json",
    "--follow",
    "--hidden",
    "--no-ignore",
    "--max-filesize",
    String(context.options.maxContentBytes),
    "--sort",
    "path",
  ]

  if (searchMatchMode(context.options) === "literal") {
    args.push("--fixed-strings")
  }
  if (!context.options.caseSensitive) args.push("--ignore-case")
  if (context.options.wholeWord) args.push("--word-regexp")

  if (context.options.maxDepth !== undefined)
    args.push("--max-depth", String(context.options.maxDepth))
  for (const ignored of defaultIgnoredNames) {
    args.push("--glob", `!${ignored}/**`)
    args.push("--glob", `!**/${ignored}/**`)
  }
  for (const glob of includeGlobArgs(context.options.includeGlobs)) {
    args.push("--glob", glob)
  }
  for (const glob of excludeGlobArgs(context.options.excludeGlobs)) {
    args.push("--glob", glob)
  }

  args.push("--regexp", context.query, context.root.absolutePath)
  return args
}

function searchMatchMode(options: FindOptions) {
  return options.matchMode ?? "literal"
}

function includeGlobArgs(globs: readonly string[] | undefined) {
  return expandedGlobArgs(globs, "")
}

function excludeGlobArgs(globs: readonly string[] | undefined) {
  return expandedGlobArgs(globs, "!")
}

function expandedGlobArgs(
  globs: readonly string[] | undefined,
  prefix: string
) {
  if (!globs) return []

  return globs.flatMap((glob) => globArgs(glob, prefix))
}

function globArgs(glob: string, prefix: string) {
  if (glob.startsWith("**/")) return [`${prefix}${glob}`]
  if (glob.includes("/")) return [`${prefix}${glob}`, `${prefix}**/${glob}`]

  return [`${prefix}${glob}`, `${prefix}**/${glob}`]
}

function fdType(entryType?: EntryTypeFilter) {
  if (entryType === "symlink") return "symlink"

  return null
}

function shouldSearchContent(options: FindOptions) {
  if (!options.includeContent) return false
  if (options.entryType && options.entryType !== "file") return false

  return true
}

function shouldSearchNames(options: FindOptions) {
  return options.includeNames !== false
}

async function nameMatchFromPath(
  paths: WorkspacePaths,
  relativePath: string,
  context: FindContext,
  entryType?: EntryTypeFilter
): Promise<FindMatch | null> {
  const absolutePath = paths.resolve(relativePath).absolutePath
  const entryStats = await safeEntryStats(absolutePath)
  if (!entryStats) return null

  if (!matchesEntryType(entryStats, entryType)) return null
  if (!context.matcher.pathMatches(globMatchPath(context, relativePath)))
    return null
  if (!nameSearchMatches(context, relativePath)) return null

  return {
    kind: "name",
    path: relativePath,
    source: "disk",
    targetType: entryStats.targetType,
    type: entryStats.type,
  }
}

async function contentMatchesFromJson(
  paths: WorkspacePaths,
  context: FindContext,
  line: string
): Promise<FindMatch[]> {
  const event = parseRgLine(line)
  if (!event) return []
  if (!isRgMatchEvent(event)) return []

  return contentMatchesFromRgEvent(paths, context, event)
}

async function contentMatchesFromRgEvent(
  paths: WorkspacePaths,
  context: FindContext,
  event: RgMatchEvent
): Promise<FindMatch[]> {
  const relativePath = safeRgRelativePath(paths, context, event.data.path.text)
  if (!relativePath) return []
  if (!context.matcher.pathMatches(globMatchPath(context, relativePath)))
    return []

  const absolutePath = paths.resolve(relativePath).absolutePath
  const entryStats = await safeEntryStats(absolutePath)
  if (!entryStats) return []
  if (!isFileEntry(entryStats)) return []

  const line = event.data.lines.text
  if (event.data.submatches.length === 0) return []

  return event.data.submatches.map((match) =>
    contentMatch({
      columnIndex: match.start,
      endColumnIndex: match.end,
      entry: entryStats,
      line,
      lineNumber: event.data.line_number,
      relativePath,
    })
  )
}

function safeRgRelativePath(
  paths: WorkspacePaths,
  context: FindContext,
  input: string
) {
  try {
    return rgRelativePath(paths, context, input)
  } catch {
    return null
  }
}

function rgRelativePath(
  paths: WorkspacePaths,
  context: FindContext,
  input: string
) {
  const absolutePath = path.isAbsolute(input)
    ? input
    : path.join(context.root.absolutePath, input)

  return paths.toRelative(path.resolve(absolutePath))
}

function parseRgLine(line: string): RgEvent | null {
  try {
    return JSON.parse(line) as RgEvent
  } catch {
    return null
  }
}

function isRgMatchEvent(event: RgEvent): event is RgMatchEvent {
  if (event.type !== "match") return false
  if (!event.data || typeof event.data !== "object") return false

  return "path" in event.data && "lines" in event.data
}

async function* runToolLines(
  command: string,
  args: string[],
  signal: AbortSignal | undefined,
  successCodes: number[],
  toleratedFailureCodes: readonly number[] = []
): AsyncGenerator<string> {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] })
  const exit = waitForExit(child)
  const cleanup = attachAbort(signal, child)
  const stderr = collectToolStderr(child)
  let completed = false

  try {
    for await (const line of readLines(child.stdout)) yield line
    completed = true
  } finally {
    cleanup()
    if (!completed) child.kill()
  }

  const code = await exit
  if (successCodes.includes(code)) return
  if (signal?.aborted) return
  if (toleratedFailureCodes.includes(code)) {
    reportToolWarning(command, code, stderr())
    return
  }

  throw new FsError(
    "OPERATION_FAILED",
    toolErrorMessage(command, code, stderr())
  )
}

function collectToolStderr(child: ReturnType<typeof spawn>) {
  let stderr = ""
  child.stderr?.on("data", (chunk) => {
    stderr = `${stderr}${String(chunk)}`.slice(-4_000)
  })

  return () => stderr.trim()
}

function reportToolWarning(command: string, code: number, stderr: string) {
  const detail = stderr ? `: ${stderr}` : ""
  console.warn(`[fs/search] ${command} exited with code ${code}${detail}`)
}

function toolErrorMessage(command: string, code: number, stderr: string) {
  if (!stderr) return `${command} exited with code ${code}`

  return `${command} exited with code ${code}: ${stderr}`
}

function attachAbort(
  signal: AbortSignal | undefined,
  child: ReturnType<typeof spawn>
) {
  if (!signal) return () => {}

  const abort = () => child.kill()
  signal.addEventListener("abort", abort, { once: true })
  return () => signal.removeEventListener("abort", abort)
}

function waitForExit(child: ReturnType<typeof spawn>) {
  return new Promise<number>((resolve, reject) => {
    child.once("error", reject)
    child.once("close", (code) => resolve(code ?? 0))
  })
}

async function* readLines(
  stream: NodeJS.ReadableStream | null
): AsyncGenerator<string> {
  if (!stream) return

  let buffered = ""
  for await (const chunk of stream) {
    const lines = (buffered + String(chunk)).split(/\r?\n/)
    buffered = lines.pop() ?? ""
    for (const line of lines) yield line
  }

  if (buffered) yield buffered
}

async function* searchWithFallback(context: FindContext) {
  const matches: FindMatch[] = []
  await searchDirectory(
    context.root.absolutePath,
    context.root.relativePath,
    context,
    context.options,
    matches,
    1
  )

  for (const match of matches) yield match
}

async function searchDirectory(
  absoluteDirectory: string,
  relativeDirectory: string,
  context: FindContext,
  options: FindOptions,
  matches: FindMatch[],
  depth: number
) {
  if (matches.length >= options.limit) return

  const dirents = await readdir(absoluteDirectory, { withFileTypes: true })
  for (const dirent of sortedDirents(dirents)) {
    if (matches.length >= options.limit) return
    await searchEntry(
      absoluteDirectory,
      relativeDirectory,
      dirent.name,
      context,
      options,
      matches,
      depth
    )
  }
}

function sortedDirents<T extends { name: string }>(dirents: T[]) {
  return dirents.sort((left, right) => left.name.localeCompare(right.name))
}

async function searchEntry(
  absoluteDirectory: string,
  relativeDirectory: string,
  name: string,
  context: FindContext,
  options: FindOptions,
  matches: FindMatch[],
  depth: number
) {
  const relativePath = joinRelative(relativeDirectory, name)
  if (isIgnoredPath(relativePath)) return

  const absolutePath = path.join(absoluteDirectory, name)
  const entryStats = await safeEntryStats(absolutePath)
  if (!entryStats) return

  if (shouldSearchNames(options)) {
    addNameMatch(
      relativePath,
      name,
      entryStats,
      context,
      matches,
      options.entryType
    )
  }
  if (isDirectoryEntry(entryStats)) {
    if (!canSearchChildren(depth, options.maxDepth)) return
    await searchDirectory(
      absolutePath,
      relativePath,
      context,
      options,
      matches,
      depth + 1
    )
    return
  }

  if (!matchesEntryType(entryStats, options.entryType)) return
  if (!context.matcher.pathMatches(globMatchPath(context, relativePath))) return
  if (!options.includeContent) return
  if (!isFileEntry(entryStats)) return
  if (entryStats.targetStats.size > options.maxContentBytes) return

  await addContentMatch(
    absolutePath,
    relativePath,
    entryStats,
    context,
    matches,
    options.limit,
    options.maxContentBytes
  )
}

function canSearchChildren(depth: number, maxDepth?: number) {
  if (maxDepth === undefined) return true

  return depth < maxDepth
}

function addNameMatch(
  relativePath: string,
  name: string,
  entry: FsEntryTypeCarrier,
  context: FindContext,
  matches: FindMatch[],
  entryType?: EntryTypeFilter
) {
  if (!matchesEntryType(entry, entryType)) return
  if (!context.matcher.pathMatches(globMatchPath(context, relativePath))) return
  if (!nameSearchMatches(context, relativePath, name)) return

  matches.push({
    kind: "name",
    path: relativePath,
    source: "disk",
    targetType: entry.targetType,
    type: entry.type,
  })
}

function nameSearchMatches(
  context: FindContext,
  relativePath: string,
  name = path.basename(relativePath)
) {
  if (context.matcher.lineMatches(name).length > 0) return true

  return (
    context.matcher.lineMatches(globMatchPath(context, relativePath)).length > 0
  )
}

async function addContentMatch(
  absolutePath: string,
  relativePath: string,
  entry: FsEntryTypeCarrier,
  context: FindContext,
  matches: FindMatch[],
  limit: number,
  maxContentBytes: number
) {
  const stream = createReadStream(absolutePath, {
    highWaterMark: SEARCH_LINE_BUFFER_BYTES,
  })
  let bytesRead = 0
  let lineIndex = 0

  try {
    for await (const line of streamLines(stream, SEARCH_LINE_BUFFER_BYTES)) {
      bytesRead += line.byteLength + line.terminatorLength
      if (bytesRead > maxContentBytes) break

      addLineMatch(
        relativePath,
        entry,
        line.text,
        lineIndex,
        context.matcher,
        matches,
        limit
      )
      lineIndex += 1

      if (matches.length >= limit) break
    }
  } catch (error) {
    reportSearchContentError(relativePath, error)
  } finally {
    stream.destroy()
  }
}

function reportSearchContentError(relativePath: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[fs/search] skipped ${relativePath}: ${message}`)
}

type StreamedLine = {
  text: string
  byteLength: number
  terminatorLength: number
}

const LINE_FEED = 0x0a
const CARRIAGE_RETURN = 0x0d

async function* streamLines(
  stream: Readable,
  maxLineBytes: number
): AsyncGenerator<StreamedLine> {
  const decoder = new TextDecoder("utf-8")
  let pending: Buffer = Buffer.alloc(0)

  for await (const chunk of stream) {
    let remaining = chunk as Buffer

    while (remaining.length > 0) {
      const lfIndex = remaining.indexOf(LINE_FEED)

      if (lfIndex === -1) {
        const room = maxLineBytes - pending.length

        if (remaining.length <= room) {
          pending =
            pending.length === 0
              ? remaining
              : Buffer.concat([pending, remaining])
          break
        }

        if (room > 0) {
          pending =
            pending.length === 0
              ? remaining.subarray(0, room)
              : Buffer.concat([pending, remaining.subarray(0, room)])
        }

        yield {
          text: decoder.decode(pending),
          byteLength: pending.length,
          terminatorLength: 0,
        }
        pending = Buffer.alloc(0)
        remaining = remaining.subarray(room)
        continue
      }

      const hasPendingCr =
        lfIndex === 0 &&
        pending.length > 0 &&
        pending[pending.length - 1] === CARRIAGE_RETURN
      const hasChunkCr =
        lfIndex > 0 && remaining[lfIndex - 1] === CARRIAGE_RETURN

      let lineBytes: Buffer
      if (hasChunkCr) {
        lineBytes =
          pending.length === 0
            ? remaining.subarray(0, lfIndex - 1)
            : Buffer.concat([pending, remaining.subarray(0, lfIndex - 1)])
      } else if (hasPendingCr) {
        lineBytes = pending.subarray(0, pending.length - 1)
      } else {
        lineBytes =
          pending.length === 0
            ? remaining.subarray(0, lfIndex)
            : Buffer.concat([pending, remaining.subarray(0, lfIndex)])
      }

      yield {
        text: decoder.decode(lineBytes),
        byteLength: lineBytes.length,
        terminatorLength: hasChunkCr || hasPendingCr ? 2 : 1,
      }

      pending = Buffer.alloc(0)
      remaining = remaining.subarray(lfIndex + 1)
    }
  }

  if (pending.length > 0) {
    yield {
      text: decoder.decode(pending),
      byteLength: pending.length,
      terminatorLength: 0,
    }
  }
}

function addLineMatch(
  relativePath: string,
  entry: FsEntryTypeCarrier,
  line: string,
  index: number,
  matcher: WorkspaceSearchMatcher,
  matches: FindMatch[],
  limit: number
) {
  for (const match of matcher.lineMatches(line)) {
    if (matches.length >= limit) return
    matches.push(
      contentMatch({
        columnIndex: match.start,
        endColumnIndex: match.end,
        entry,
        line,
        lineNumber: index + 1,
        relativePath,
      })
    )
  }
}

function contentMatch({
  columnIndex,
  endColumnIndex,
  entry,
  line,
  lineNumber,
  relativePath,
}: {
  columnIndex: number
  endColumnIndex: number
  entry: FsEntryTypeCarrier
  line: string
  lineNumber: number
  relativePath: string
}): FindMatch {
  const preview = searchPreview(searchContentLineText(line), columnIndex)

  return {
    column: columnIndex + 1,
    endColumn: endColumnIndex + 1,
    kind: "content",
    line: lineNumber,
    path: relativePath,
    preview: preview.text,
    previewStartColumn: preview.startColumn,
    source: "disk",
    targetType: entry.targetType,
    type: entry.type,
  }
}

function searchContentLineText(line: string) {
  return line.replace(/(?:\r\n|\r|\n)$/u, "")
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

async function safeEntryStats(absolutePath: string) {
  try {
    return await readEntryStats(absolutePath)
  } catch {
    return null
  }
}

function joinRelative(parent: string, child: string) {
  if (!parent) return child
  return toPosix(path.join(parent, child))
}

function resultPath(rootRelativePath: string, output: string) {
  const cleanOutput = output.replace(/^\.\//, "").replace(/\/$/, "")
  if (!rootRelativePath) return toPosix(cleanOutput)

  return toPosix(path.join(rootRelativePath, cleanOutput))
}

function globMatchPath(context: FindContext, relativePath: string) {
  if (!context.root.relativePath) return relativePath
  if (relativePath === context.root.relativePath) return ""

  const prefix = `${context.root.relativePath}/`
  if (!relativePath.startsWith(prefix)) return relativePath

  return relativePath.slice(prefix.length)
}

type RgEvent =
  | RgMatchEvent
  | {
      type: string
      data?: unknown
    }

type RgMatchEvent = {
  type: "match"
  data: {
    path: {
      text: string
    }
    lines: {
      text: string
    }
    line_number: number
    submatches: Array<{
      end: number
      start: number
    }>
  }
}
