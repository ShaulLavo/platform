import { stat } from 'node:fs/promises'
import path from 'node:path'

import {
  compareFuzzyRankedTargets,
  createWorkspaceSearchMatcher,
  isFileEntry,
  matchesEntryType,
  type WorkspaceSearchDoneEvent,
  type WorkspaceSearchProviderSource,
} from '@workspace/contracts'

import { FsError, mapNodeError } from './errors'
import { defaultIgnoredNames, type WorkspacePaths } from './path'
import { searchWithFallback } from './search-fallback'
import { workspaceGitIgnoreMatcher } from './search-gitignore'
import { SearchMeasurementRecorder, type SearchProviderRun } from './search-measurement'
import { parseRgMatchLine, type RgMatchEvent } from './search-rg-parser'
import {
  contentMatch,
  globMatchPath,
  isIgnoredSearchPath,
  nameSearchMatches,
  nameSearchRankTarget,
  resultPath,
  safeEntryStats,
  searchMatchMetadata,
  searchMatchMode,
  shouldSearchContent,
  shouldSearchNames,
  type FindContext,
  type FindMatch,
  type FindOptions,
} from './search-shared'
import { canUseSearchTools, runToolLines } from './search-tool-runner'
import { assertDirectory } from './stat'
import { recordRequestContext } from '../observability'
import type { EntryTypeFilter } from './contracts'
import type { WorkspaceIndex, WorkspaceIndexEntry } from './workspace-index'

export { SEARCH_LINE_BUFFER_BYTES } from './search-line-decoder'
export type { FindMatch, FindOptions } from './search-shared'

export type FindResult = {
  query: string
  path: string
  matches: FindMatch[]
}

export type SearchStreamEvent =
  | {
      type: 'match'
      match: FindMatch
    }
  | WorkspaceSearchDoneEvent

export type SearchProvider = {
  search(query: FindOptions, signal?: AbortSignal): AsyncIterable<SearchStreamEvent>
}

export type SearchProviderOptions = {
  workspaceIndex?: WorkspaceIndex
}

type SearchState = {
  count: number
  truncated: boolean
}

type SearchRuntimeOptions = {
  streamNameMatchesEarly: boolean
}

export type ContentSearchRgArgsInput = {
  contentExcludeGlobs?: readonly string[]
  options: FindOptions
  query: string
  rootSearchPath: string
}

type NameCandidateRanker = {
  candidates: string[]
  capacity: number
  context: FindContext
  query: string
}

const NAME_SEARCH_RANK_BUFFER_MULTIPLIER = 4
const NAME_SEARCH_MIN_RANK_BUFFER = 32
const NAME_SEARCH_MAX_RANK_BUFFER = 1_000
const NAME_SEARCH_EARLY_SCAN_COUNT = 64
const NAME_SEARCH_EARLY_SCAN_INTERVAL = 32
export const CONTENT_INDEX_RG_EXCLUDE_GLOB_LIMIT = 512
const RG_GLOB_SPECIAL_CHARACTERS = new Set(['\\', '*', '?', '[', ']', '{', '}'])

const exactSearchRuntimeOptions: SearchRuntimeOptions = {
  streamNameMatchesEarly: false,
}

const streamingSearchRuntimeOptions: SearchRuntimeOptions = {
  streamNameMatchesEarly: true,
}

export class DiskWorkspaceSearchProvider implements SearchProvider {
  private options: SearchProviderOptions
  private paths: WorkspacePaths

  constructor(paths: WorkspacePaths, options: SearchProviderOptions = {}) {
    this.options = options
    this.paths = paths
  }

  search(query: FindOptions, signal?: AbortSignal) {
    return searchWorkspaceWithDiskTools(
      this.paths,
      query,
      signal,
      streamingSearchRuntimeOptions,
      this.options,
    )
  }
}

class PathIndexSearchProvider {
  private index: WorkspaceIndex

  constructor(index: WorkspaceIndex) {
    this.index = index
  }

  static ready(index: WorkspaceIndex | undefined) {
    if (!index) return null
    if (index.status().readiness !== 'ready') return null

    return new PathIndexSearchProvider(index)
  }

  async *searchNames(context: FindContext): AsyncGenerator<FindMatch> {
    const entries = this.index.entries()
    const entriesByPath = new Map(entries.map((entry) => [entry.path, entry]))
    const ranker = createNameCandidateRanker(context, nameRankCapacity(context.options.limit))
    const emittedPaths = new Set<string>()

    for (const entry of entries) {
      if (!indexEntryMatchesContext(context, entry)) continue

      addNameCandidate(ranker, entry.path)
    }

    yield* takeRankedIndexNameMatches(
      context,
      ranker,
      emittedPaths,
      entriesByPath,
      context.options.limit + 1,
    )
  }
}

class ContentIndexFilter {
  private entriesByPath: ReadonlyMap<string, WorkspaceIndexEntry>

  constructor(entries: readonly WorkspaceIndexEntry[]) {
    this.entriesByPath = new Map(entries.map((entry) => [entry.path, entry]))
  }

  static ready(index: WorkspaceIndex | undefined) {
    if (!index) return null
    if (index.status().readiness !== 'ready') return null

    return new ContentIndexFilter(index.entries())
  }

  canSearchContent(relativePath: string) {
    const entry = this.entriesByPath.get(relativePath)
    if (!entry) return true
    if (entry.stale) return true

    return !isIndexBinaryContentCandidate(entry)
  }

  rgExcludeGlobs(context: FindContext) {
    const globs: string[] = []

    for (const entry of this.entriesByPath.values()) {
      if (globs.length >= CONTENT_INDEX_RG_EXCLUDE_GLOB_LIMIT) break

      const glob = rgExcludeGlobForIndexEntry(context, entry)
      if (!glob) continue

      globs.push(glob)
    }

    return globs
  }
}

export async function findInWorkspace(
  paths: WorkspacePaths,
  options: FindOptions,
): Promise<FindResult> {
  const matches: FindMatch[] = []
  let resultPath = options.path

  const events = searchWorkspaceWithDiskTools(paths, options, undefined, exactSearchRuntimeOptions)

  for await (const event of events) {
    if (event.type === 'done') {
      resultPath = event.path
      continue
    }

    if (event.type === 'match') matches.push(event.match)
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
  signal?: AbortSignal,
  providerOptions: SearchProviderOptions = {},
): AsyncGenerator<SearchStreamEvent> {
  const provider = new DiskWorkspaceSearchProvider(paths, providerOptions)

  yield* provider.search(options, signal)
}

async function* searchWorkspaceWithDiskTools(
  paths: WorkspacePaths,
  options: FindOptions,
  signal?: AbortSignal,
  runtime: SearchRuntimeOptions = streamingSearchRuntimeOptions,
  providerOptions: SearchProviderOptions = {},
): AsyncGenerator<SearchStreamEvent> {
  if (signal?.aborted) return

  const context = await createFindContext(paths, options)
  const matches = searchWithTools(paths, context, signal, runtime, providerOptions)
  const state: SearchState = { count: 0, truncated: false }

  for await (const match of matches) {
    if (state.count >= options.limit) {
      state.truncated = true
      break
    }

    state.count += 1
    yield { type: 'match', match }
  }

  const measurement = context.measurement.snapshot()
  recordRequestContext({ search: { measurement } })

  yield {
    count: state.count,
    measurement,
    path: context.root.relativePath,
    query: context.query,
    truncated: state.truncated,
    type: 'done',
  }
}

async function createFindContext(
  paths: WorkspacePaths,
  options: FindOptions,
): Promise<FindContext> {
  const root = paths.resolve(options.path)
  const measurement = new SearchMeasurementRecorder()

  if (!options.query) throw new FsError('INVALID_PATH', 'query is required')
  if (shouldSearchContent(options) && queryHasLineBreak(options.query)) {
    throw new FsError('INVALID_PATH', 'multiline content search is not supported')
  }

  try {
    const stats = await measurement.measureStat(root.relativePath || '.', () =>
      stat(root.absolutePath),
    )
    assertDirectory(stats)

    return {
      query: options.query,
      gitIgnore: await workspaceGitIgnoreMatcher(paths),
      matcher: createWorkspaceSearchMatcher(options),
      measurement,
      options,
      root,
      statCache: new Map(),
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
  runtime: SearchRuntimeOptions,
  providerOptions: SearchProviderOptions,
): AsyncGenerator<FindMatch> {
  if (isIgnoredSearchPath(context, context.root.relativePath)) return

  const searchNames = shouldSearchNames(context.options)
  const searchContent = shouldSearchContent(context.options)
  const workspaceIndex = workspaceIndexForQuery(context.options, providerOptions.workspaceIndex)
  const pathIndexProvider =
    searchNames && canUsePathIndexForQuery(context.options)
      ? PathIndexSearchProvider.ready(workspaceIndex)
      : null
  const contentIndexFilter = searchContent ? ContentIndexFilter.ready(workspaceIndex) : null
  const needsFd = searchNames && !pathIndexProvider

  if (!(await canUseTools({ content: searchContent, names: needsFd }))) {
    // TODO: remove this fallback after fd/rg installation or tool discovery is guaranteed.
    recordRequestContext({ search: { provider: 'fallback' } })
    yield* measureProvider(context, 'fallback', searchWithFallback(context))
    return
  }

  recordRequestContext({ search: { provider: searchProviderLabel(pathIndexProvider, needsFd) } })
  if (pathIndexProvider) {
    yield* measureProvider(context, 'index', pathIndexProvider.searchNames(context))
  } else if (searchNames) {
    yield* measureProvider(context, 'fd', searchNamesWithFd(paths, context, signal, runtime))
  }
  if (!searchContent) return

  yield* measureProvider(
    context,
    'rg',
    searchContentWithRg(paths, context, signal, contentIndexFilter),
  )
}

async function* measureProvider(
  context: FindContext,
  source: WorkspaceSearchProviderSource,
  matches: AsyncGenerator<FindMatch>,
): AsyncGenerator<FindMatch> {
  const provider = context.measurement.startProvider(source)

  try {
    yield* measuredMatches(context, provider, matches)
  } finally {
    context.measurement.endProvider(provider)
  }
}

async function* measuredMatches(
  context: FindContext,
  provider: SearchProviderRun,
  matches: AsyncGenerator<FindMatch>,
): AsyncGenerator<FindMatch> {
  for await (const match of matches) {
    context.measurement.recordProviderResult(provider)
    yield match
  }
}

function searchProviderLabel(pathIndexProvider: PathIndexSearchProvider | null, needsFd: boolean) {
  if (pathIndexProvider && !needsFd) return 'index'

  return 'disk-tools'
}

async function canUseTools(required: { content: boolean; names: boolean }) {
  return canUseSearchTools(required)
}

function canUsePathIndexForQuery(options: FindOptions) {
  if (options.useWorkspaceIndex === false) return false

  return searchMatchMode(options) !== 'regex'
}

function workspaceIndexForQuery(options: FindOptions, index: WorkspaceIndex | undefined) {
  if (options.useWorkspaceIndex === false) return undefined

  return index
}

async function* searchNamesWithFd(
  paths: WorkspacePaths,
  context: FindContext,
  signal: AbortSignal | undefined,
  runtime: SearchRuntimeOptions,
): AsyncGenerator<FindMatch> {
  const args = fdArgs(context)
  const ranker = createNameCandidateRanker(context, nameRankCapacity(context.options.limit))
  const emittedPaths = new Set<string>()
  let scannedCount = 0
  let nextEarlyScanCount = NAME_SEARCH_EARLY_SCAN_COUNT

  for await (const line of runToolLines('fd', args, signal, [0])) {
    const relativePath = resultPath(context.root.relativePath, line)
    scannedCount += 1

    if (!nameCandidateMatchesContext(context, relativePath)) continue

    addNameCandidate(ranker, relativePath)

    if (!shouldYieldEarlyNameMatch(runtime, ranker, scannedCount, nextEarlyScanCount)) {
      continue
    }

    nextEarlyScanCount = scannedCount + NAME_SEARCH_EARLY_SCAN_INTERVAL

    const match = await takeRankedNameMatch(paths, context, ranker, emittedPaths)
    if (!match) continue

    yield match
  }

  if (signal?.aborted) return

  for await (const match of takeRankedNameMatches(
    paths,
    context,
    ranker,
    emittedPaths,
    context.options.limit + 1,
  )) {
    yield match
  }
}

function nameCandidateMatchesContext(context: FindContext, relativePath: string) {
  if (!context.matcher.pathMatches(globMatchPath(context, relativePath))) return false

  return nameSearchMatches(context, relativePath)
}

function createNameCandidateRanker(context: FindContext, capacity: number): NameCandidateRanker {
  return {
    candidates: [],
    capacity,
    context,
    query: context.query,
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

function nameCandidateInsertionIndex(ranker: NameCandidateRanker, relativePath: string) {
  let low = 0
  let high = ranker.candidates.length

  while (low < high) {
    const index = Math.floor((low + high) / 2)
    const candidate = ranker.candidates[index] ?? ''

    if (compareNameCandidates(ranker, relativePath, candidate) < 0) {
      high = index
      continue
    }

    low = index + 1
  }

  return low
}

function compareNameCandidates(ranker: NameCandidateRanker, left: string, right: string) {
  return compareFuzzyRankedTargets(
    nameSearchRankTarget(ranker.context, left),
    nameSearchRankTarget(ranker.context, right),
    ranker.query,
  )
}

function shouldYieldEarlyNameMatch(
  runtime: SearchRuntimeOptions,
  ranker: NameCandidateRanker,
  scannedCount: number,
  nextEarlyScanCount: number,
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
  limit: number,
): AsyncGenerator<FindMatch> {
  let count = 0

  while (count < limit) {
    const match = await takeRankedNameMatch(paths, context, ranker, emittedPaths)
    if (!match) return

    count += 1
    yield match
  }
}

async function* takeRankedIndexNameMatches(
  context: FindContext,
  ranker: NameCandidateRanker,
  emittedPaths: Set<string>,
  entriesByPath: ReadonlyMap<string, WorkspaceIndexEntry>,
  limit: number,
): AsyncGenerator<FindMatch> {
  let count = 0

  while (count < limit) {
    const match = takeRankedIndexNameMatch(context, ranker, emittedPaths, entriesByPath)
    if (!match) return

    count += 1
    yield match
  }
}

function takeRankedIndexNameMatch(
  context: FindContext,
  ranker: NameCandidateRanker,
  emittedPaths: Set<string>,
  entriesByPath: ReadonlyMap<string, WorkspaceIndexEntry>,
) {
  while (ranker.candidates.length > 0) {
    const relativePath = ranker.candidates.shift()
    if (!relativePath) return null
    if (emittedPaths.has(relativePath)) continue

    const entry = entriesByPath.get(relativePath)
    if (!entry) continue

    const match = nameMatchFromIndexEntry(entry, context)
    if (!match) continue

    emittedPaths.add(match.path)
    return match
  }

  return null
}

async function takeRankedNameMatch(
  paths: WorkspacePaths,
  context: FindContext,
  ranker: NameCandidateRanker,
  emittedPaths: Set<string>,
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

async function* searchContentWithRg(
  paths: WorkspacePaths,
  context: FindContext,
  signal?: AbortSignal,
  contentIndexFilter?: ContentIndexFilter | null,
): AsyncGenerator<FindMatch> {
  const args = rgArgs(context, contentIndexFilter)

  for await (const line of runToolLines('rg', args, signal, [0, 1], [2], {
    cwd: context.root.absolutePath,
  })) {
    const matches = await contentMatchesFromJson(paths, context, line, contentIndexFilter)
    for (const match of matches) yield match
  }
}

function fdArgs(context: FindContext) {
  const args = [
    '--base-directory',
    context.root.absolutePath,
    '--hidden',
    '--no-require-git',
    '--path-separator',
    '/',
  ]

  if (shouldFollowFdResults(context.options.entryType)) args.push('--follow')

  if (searchMatchMode(context.options) === 'literal') {
    args.push('--fixed-strings')
  }
  if (!context.options.caseSensitive) args.push('--ignore-case')

  for (const type of fdTypes(context.options.entryType)) {
    args.push('--type', type)
  }
  if (context.options.maxDepth !== undefined)
    args.push('--max-depth', String(context.options.maxDepth))

  for (const ignored of defaultIgnoredNames) args.push('--exclude', ignored)

  if (searchMatchMode(context.options) !== 'fuzzy') args.push(context.query)
  return args
}

function rgArgs(context: FindContext, contentIndexFilter?: ContentIndexFilter | null) {
  return contentSearchRgArgs({
    contentExcludeGlobs: contentIndexFilter?.rgExcludeGlobs(context),
    options: context.options,
    query: context.query,
    rootSearchPath: '.',
  })
}

export function contentSearchRgArgs(input: ContentSearchRgArgsInput) {
  const args = [
    '--json',
    '--follow',
    '--hidden',
    '--no-config',
    '--no-require-git',
    '--max-filesize',
    String(input.options.maxContentBytes),
    '--sort',
    'path',
  ]
  const matchMode = searchMatchMode(input.options)

  if (matchMode === 'literal') {
    args.push('--fixed-strings')
  }
  if (matchMode === 'regex') {
    args.push('--crlf', '--engine', 'auto')
  }
  if (!input.options.caseSensitive) args.push('--ignore-case')
  if (input.options.wholeWord) args.push('--word-regexp')

  if (input.options.maxDepth !== undefined) args.push('--max-depth', String(input.options.maxDepth))
  for (const ignored of defaultIgnoredNames) {
    for (const glob of ignoredDirectoryGlobArgs(ignored)) {
      args.push('--glob', glob)
    }
  }
  for (const glob of includeGlobArgs(input.options.includeGlobs)) {
    args.push('--glob', glob)
  }
  for (const glob of excludeGlobArgs(input.options.excludeGlobs)) {
    args.push('--glob', glob)
  }
  for (const glob of contentExcludeGlobArgs(input.contentExcludeGlobs)) {
    args.push('--glob', glob)
  }

  args.push('--regexp', input.query, input.rootSearchPath)
  return args
}

function includeGlobArgs(globs: readonly string[] | undefined) {
  return expandedGlobArgs(globs, '')
}

function excludeGlobArgs(globs: readonly string[] | undefined) {
  return expandedGlobArgs(globs, '!')
}

function contentExcludeGlobArgs(globs: readonly string[] | undefined) {
  if (!globs) return []

  return globs.slice(0, CONTENT_INDEX_RG_EXCLUDE_GLOB_LIMIT)
}

function expandedGlobArgs(globs: readonly string[] | undefined, prefix: string) {
  if (!globs) return []

  return globs.flatMap((glob) => globArgs(glob, prefix))
}

function globArgs(glob: string, prefix: string) {
  if (glob.startsWith('**/')) return [`${prefix}${glob}`]
  if (glob.includes('/')) return [`${prefix}${glob}`]

  return [`${prefix}${glob}`, `${prefix}**/${glob}`]
}

function queryHasLineBreak(query: string) {
  return query.includes('\n') || query.includes('\r')
}

function ignoredDirectoryGlobArgs(name: string) {
  return [`!${name}`, `!${name}/**`, `!**/${name}`, `!**/${name}/**`]
}

function shouldFollowFdResults(entryType?: EntryTypeFilter) {
  return entryType !== 'symlink'
}

function fdTypes(entryType?: EntryTypeFilter) {
  if (entryType === 'file') return ['file']
  if (entryType === 'directory') return ['directory']
  if (entryType === 'symlink') return ['symlink']
  if (entryType === 'other') return ['socket', 'pipe', 'block-device', 'char-device']

  return []
}

async function nameMatchFromPath(
  paths: WorkspacePaths,
  relativePath: string,
  context: FindContext,
): Promise<FindMatch | null> {
  const absolutePath = paths.resolve(relativePath).absolutePath
  const entryStats = await safeEntryStats(
    absolutePath,
    context.measurement,
    relativePath,
    context.statCache,
  )
  if (!entryStats) return null

  if (!matchesEntryType(entryStats, context.options.entryType)) return null

  return {
    ...searchMatchMetadata(entryStats),
    kind: 'name',
    path: relativePath,
    source: 'disk',
    targetType: entryStats.targetType,
    type: entryStats.type,
  }
}

function nameMatchFromIndexEntry(
  entry: WorkspaceIndexEntry,
  context: FindContext,
): FindMatch | null {
  if (entry.stale) return null
  if (!matchesEntryType(entry, context.options.entryType)) return null

  return {
    birthtimeMs: entry.birthtimeMs,
    kind: 'name',
    mtimeMs: entry.mtimeMs,
    path: entry.path,
    size: entry.size,
    source: 'disk',
    targetType: entry.targetType,
    type: entry.type,
  }
}

function indexEntryMatchesContext(context: FindContext, entry: WorkspaceIndexEntry) {
  if (!indexEntryIsSearchCandidate(entry)) return false
  if (!indexEntryIsInsideRoot(context, entry.path)) return false
  if (!indexEntryMatchesDepth(context, entry.path)) return false
  if (!matchesEntryType(entry, context.options.entryType)) return false
  if (!indexEntryCharBagMatches(context, entry)) return false

  return nameCandidateMatchesContext(context, entry.path)
}

function indexEntryIsSearchCandidate(entry: WorkspaceIndexEntry) {
  if (entry.stale) return false
  if (entry.defaultIgnored) return false

  return !entry.gitIgnored
}

function isIndexBinaryContentCandidate(entry: WorkspaceIndexEntry) {
  if (entry.contentKind === 'binary') return true
  if (entry.contentKind === 'image') return true
  if (entry.fileKind === 'binary') return true

  return entry.fileKind === 'image'
}

function rgExcludeGlobForIndexEntry(context: FindContext, entry: WorkspaceIndexEntry) {
  if (!isIndexBinaryContentCandidate(entry)) return null
  if (entry.stale) return null
  if (!indexEntryIsInsideRoot(context, entry.path)) return null
  if (!indexEntryMatchesDepth(context, entry.path)) return null

  const matchPath = globMatchPath(context, entry.path)
  if (!matchPath) return null
  if (!context.matcher.pathMatches(matchPath)) return null

  return `!${escapeRgGlobPath(matchPath)}`
}

function escapeRgGlobPath(relativePath: string) {
  let escaped = ''

  for (const character of relativePath) {
    if (shouldEscapeRgGlobCharacter(character, escaped.length)) escaped += '\\'

    escaped += character
  }

  return escaped
}

function shouldEscapeRgGlobCharacter(character: string, index: number) {
  if (index === 0 && character === '!') return true

  return RG_GLOB_SPECIAL_CHARACTERS.has(character)
}

function indexEntryIsInsideRoot(context: FindContext, relativePath: string) {
  const root = context.root.relativePath
  if (!root) return relativePath !== ''
  if (relativePath === root) return false

  return relativePath.startsWith(`${root}/`)
}

function indexEntryMatchesDepth(context: FindContext, relativePath: string) {
  if (context.options.maxDepth === undefined) return true

  const depth = indexEntryDepth(context, relativePath)
  if (depth === null) return false

  return depth <= context.options.maxDepth
}

function indexEntryDepth(context: FindContext, relativePath: string) {
  const matchPath = globMatchPath(context, relativePath)
  if (!matchPath) return null

  return matchPath.split('/').filter(Boolean).length
}

function indexEntryCharBagMatches(context: FindContext, entry: WorkspaceIndexEntry) {
  if (searchMatchMode(context.options) !== 'fuzzy') return true

  return charBagContainsQuery(entry.charBag, context.query)
}

function charBagContainsQuery(charBag: string, query: string) {
  for (const character of query.toLocaleLowerCase()) {
    if (charBagIgnoredQueryCharacter(character)) continue
    if (charBag.includes(character)) continue

    return false
  }

  return true
}

function charBagIgnoredQueryCharacter(character: string) {
  if (character === '/') return true

  return /\s/u.test(character)
}

async function contentMatchesFromJson(
  paths: WorkspacePaths,
  context: FindContext,
  line: string,
  contentIndexFilter?: ContentIndexFilter | null,
): Promise<FindMatch[]> {
  const event = parseRgMatchLine(line)
  if (!event) return []

  return contentMatchesFromRgEvent(paths, context, event, contentIndexFilter)
}

async function contentMatchesFromRgEvent(
  paths: WorkspacePaths,
  context: FindContext,
  event: RgMatchEvent,
  contentIndexFilter?: ContentIndexFilter | null,
): Promise<FindMatch[]> {
  const relativePath = safeRgRelativePath(paths, context, event.data.path.text)
  if (!relativePath) return []
  if (!context.matcher.pathMatches(globMatchPath(context, relativePath))) return []
  if (contentIndexFilter && !contentIndexFilter.canSearchContent(relativePath)) return []

  const absolutePath = paths.resolve(relativePath).absolutePath
  const entryStats = await safeEntryStats(
    absolutePath,
    context.measurement,
    relativePath,
    context.statCache,
  )
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
    }),
  )
}

function safeRgRelativePath(paths: WorkspacePaths, context: FindContext, input: string) {
  try {
    return rgRelativePath(paths, context, input)
  } catch {
    return null
  }
}

function rgRelativePath(paths: WorkspacePaths, context: FindContext, input: string) {
  const absolutePath = path.isAbsolute(input) ? input : path.join(context.root.absolutePath, input)

  return paths.toRelative(path.resolve(absolutePath))
}
