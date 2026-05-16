import { stat } from "node:fs/promises"
import path from "node:path"

import {
  compareFuzzyRankedTargets,
  createWorkspaceSearchMatcher,
  type WorkspaceSearchDoneEvent,
} from "@workspace/contracts"

import { FsError, mapNodeError } from "./errors"
import { defaultIgnoredNames, type WorkspacePaths } from "./path"
import { searchWithFallback } from "./search-fallback"
import { workspaceGitIgnoreMatcher } from "./search-gitignore"
import { parseRgMatchLine, type RgMatchEvent } from "./search-rg-parser"
import {
  contentMatch,
  globMatchPath,
  isIgnoredSearchPath,
  nameSearchMatches,
  resultPath,
  safeEntryStats,
  searchMatchMetadata,
  searchMatchMode,
  shouldSearchContent,
  shouldSearchNames,
  type FindContext,
  type FindMatch,
  type FindOptions,
} from "./search-shared"
import { canUseSearchTools, runToolLines } from "./search-tool-runner"
import { assertDirectory, isFileEntry, matchesEntryType } from "./stat"
import type { EntryTypeFilter } from "./contracts"

export { SEARCH_LINE_BUFFER_BYTES } from "./search-line-decoder"
export type { FindMatch, FindOptions } from "./search-shared"

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

type SearchState = {
  count: number
  truncated: boolean
}

type SearchRuntimeOptions = {
  streamNameMatchesEarly: boolean
}

type NameCandidateRanker = {
  candidates: string[]
  capacity: number
  query: string
}

const NAME_SEARCH_RANK_BUFFER_MULTIPLIER = 4
const NAME_SEARCH_MIN_RANK_BUFFER = 32
const NAME_SEARCH_MAX_RANK_BUFFER = 1_000
const NAME_SEARCH_EARLY_SCAN_COUNT = 64
const NAME_SEARCH_EARLY_SCAN_INTERVAL = 32

const exactSearchRuntimeOptions: SearchRuntimeOptions = {
  streamNameMatchesEarly: false,
}

const streamingSearchRuntimeOptions: SearchRuntimeOptions = {
  streamNameMatchesEarly: true,
}

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

  const events = searchWorkspaceWithDiskTools(
    paths,
    options,
    undefined,
    exactSearchRuntimeOptions
  )

  for await (const event of events) {
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
  signal?: AbortSignal,
  runtime: SearchRuntimeOptions = streamingSearchRuntimeOptions
): AsyncGenerator<FindStreamEvent> {
  if (signal?.aborted) return

  const context = await createFindContext(paths, options)
  const matches = searchWithTools(paths, context, signal, runtime)
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
      gitIgnore: await workspaceGitIgnoreMatcher(paths),
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
  signal: AbortSignal | undefined,
  runtime: SearchRuntimeOptions
): AsyncGenerator<FindMatch> {
  if (isIgnoredSearchPath(context, context.root.relativePath)) return

  if (!(await canUseTools(context.options))) {
    // TODO: remove this fallback after fd/rg installation or tool discovery is guaranteed.
    yield* searchWithFallback(context)
    return
  }

  if (shouldSearchNames(context.options)) {
    yield* searchNamesWithFd(paths, context, signal, runtime)
  }
  if (!shouldSearchContent(context.options)) return

  yield* searchContentWithRg(paths, context, signal)
}

async function canUseTools(options: FindOptions) {
  return canUseSearchTools({
    content: shouldSearchContent(options),
    names: shouldSearchNames(options),
  })
}

async function* searchNamesWithFd(
  paths: WorkspacePaths,
  context: FindContext,
  signal: AbortSignal | undefined,
  runtime: SearchRuntimeOptions
): AsyncGenerator<FindMatch> {
  const args = fdArgs(context)
  const ranker = createNameCandidateRanker(
    context.query,
    nameRankCapacity(context.options.limit)
  )
  const emittedPaths = new Set<string>()
  let scannedCount = 0
  let nextEarlyScanCount = NAME_SEARCH_EARLY_SCAN_COUNT

  for await (const line of runToolLines("fd", args, signal, [0])) {
    const relativePath = resultPath(context.root.relativePath, line)
    scannedCount += 1

    if (!nameCandidateMatchesContext(context, relativePath)) continue

    addNameCandidate(ranker, relativePath)

    if (
      !shouldYieldEarlyNameMatch(
        runtime,
        ranker,
        scannedCount,
        nextEarlyScanCount
      )
    ) {
      continue
    }

    nextEarlyScanCount = scannedCount + NAME_SEARCH_EARLY_SCAN_INTERVAL

    const match = await takeRankedNameMatch(
      paths,
      context,
      ranker,
      emittedPaths
    )
    if (!match) continue

    yield match
  }

  if (signal?.aborted) return

  for await (const match of takeRankedNameMatches(
    paths,
    context,
    ranker,
    emittedPaths,
    context.options.limit + 1
  )) {
    yield match
  }
}

function nameCandidateMatchesContext(
  context: FindContext,
  relativePath: string
) {
  if (!context.matcher.pathMatches(globMatchPath(context, relativePath)))
    return false

  return nameSearchMatches(context, relativePath)
}

function createNameCandidateRanker(
  query: string,
  capacity: number
): NameCandidateRanker {
  return {
    candidates: [],
    capacity,
    query,
  }
}

function nameRankCapacity(limit: number) {
  const scaledLimit = limit * NAME_SEARCH_RANK_BUFFER_MULTIPLIER
  const bufferedLimit = Math.max(scaledLimit, NAME_SEARCH_MIN_RANK_BUFFER)

  return Math.min(bufferedLimit, NAME_SEARCH_MAX_RANK_BUFFER)
}

function addNameCandidate(ranker: NameCandidateRanker, relativePath: string) {
  if (ranker.capacity <= 0) return

  const index = nameCandidateInsertionIndex(ranker, relativePath)
  if (index >= ranker.capacity) return

  ranker.candidates.splice(index, 0, relativePath)
  if (ranker.candidates.length > ranker.capacity) ranker.candidates.pop()
}

function nameCandidateInsertionIndex(
  ranker: NameCandidateRanker,
  relativePath: string
) {
  let low = 0
  let high = ranker.candidates.length

  while (low < high) {
    const index = Math.floor((low + high) / 2)
    const candidate = ranker.candidates[index] ?? ""

    if (compareNameCandidates(relativePath, candidate, ranker.query) < 0) {
      high = index
      continue
    }

    low = index + 1
  }

  return low
}

function compareNameCandidates(left: string, right: string, query: string) {
  return compareFuzzyRankedTargets(
    searchRankTarget(left),
    searchRankTarget(right),
    query
  )
}

function shouldYieldEarlyNameMatch(
  runtime: SearchRuntimeOptions,
  ranker: NameCandidateRanker,
  scannedCount: number,
  nextEarlyScanCount: number
) {
  if (!runtime.streamNameMatchesEarly) return false
  if (ranker.candidates.length === 0) return false

  return scannedCount >= nextEarlyScanCount
}

async function* takeRankedNameMatches(
  paths: WorkspacePaths,
  context: FindContext,
  ranker: NameCandidateRanker,
  emittedPaths: Set<string>,
  limit: number
): AsyncGenerator<FindMatch> {
  let count = 0

  while (count < limit) {
    const match = await takeRankedNameMatch(
      paths,
      context,
      ranker,
      emittedPaths
    )
    if (!match) return

    count += 1
    yield match
  }
}

async function takeRankedNameMatch(
  paths: WorkspacePaths,
  context: FindContext,
  ranker: NameCandidateRanker,
  emittedPaths: Set<string>
) {
  while (ranker.candidates.length > 0) {
    const relativePath = ranker.candidates.shift()
    if (!relativePath) return null
    if (emittedPaths.has(relativePath)) continue

    const match = await nameMatchFromPath(paths, relativePath, context)
    if (!match) continue

    emittedPaths.add(match.path)
    return match
  }

  return null
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
    "--hidden",
    "--no-require-git",
    "--path-separator",
    "/",
  ]

  if (shouldFollowFdResults(context.options.entryType)) args.push("--follow")

  if (searchMatchMode(context.options) === "literal") {
    args.push("--fixed-strings")
  }
  if (!context.options.caseSensitive) args.push("--ignore-case")

  for (const type of fdTypes(context.options.entryType)) {
    args.push("--type", type)
  }
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
    "--no-require-git",
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
    for (const glob of ignoredDirectoryGlobArgs(ignored)) {
      args.push("--glob", glob)
    }
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

function ignoredDirectoryGlobArgs(name: string) {
  return [`!${name}`, `!${name}/**`, `!**/${name}`, `!**/${name}/**`]
}

function shouldFollowFdResults(entryType?: EntryTypeFilter) {
  return entryType !== "symlink"
}

function fdTypes(entryType?: EntryTypeFilter) {
  if (entryType === "file") return ["file"]
  if (entryType === "directory") return ["directory"]
  if (entryType === "symlink") return ["symlink"]
  if (entryType === "other")
    return ["socket", "pipe", "block-device", "char-device"]

  return []
}

async function nameMatchFromPath(
  paths: WorkspacePaths,
  relativePath: string,
  context: FindContext
): Promise<FindMatch | null> {
  const absolutePath = paths.resolve(relativePath).absolutePath
  const entryStats = await safeEntryStats(absolutePath)
  if (!entryStats) return null

  if (!matchesEntryType(entryStats, context.options.entryType)) return null

  return {
    ...searchMatchMetadata(entryStats),
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
  const event = parseRgMatchLine(line)
  if (!event) return []

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
