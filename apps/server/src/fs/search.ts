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
import {
  assertDirectory,
  isFileEntry,
  matchesEntryType,
} from "./stat"
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
  signal?: AbortSignal
): AsyncGenerator<FindMatch> {
  if (isIgnoredSearchPath(context, context.root.relativePath)) return

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
  return canUseSearchTools({
    content: shouldSearchContent(options),
    names: shouldSearchNames(options),
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
    "--no-require-git",
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

function fdType(entryType?: EntryTypeFilter) {
  if (entryType === "symlink") return "symlink"

  return null
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
