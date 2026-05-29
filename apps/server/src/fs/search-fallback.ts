import { createReadStream } from 'node:fs'
import { readdir } from 'node:fs/promises'
import path from 'node:path'

import {
  isDirectoryEntry,
  isFileEntry,
  matchesEntryType,
  type WorkspaceSearchMatcher,
} from '@workspace/contracts'

import type { EntryTypeFilter } from './contracts'
import { SEARCH_LINE_BUFFER_BYTES, streamLines } from './search-line-decoder'
import {
  contentMatch,
  globMatchPath,
  isIgnoredSearchPath,
  joinRelative,
  nameSearchMatches,
  safeEntryStats,
  searchMatchMetadata,
  shouldSearchNames,
  type FindContext,
  type FindMatch,
  type FindOptions,
} from './search-shared'
import type { FsEntryStats } from './stat'
import { recordRequestWarning } from '../observability'

export async function* searchWithFallback(context: FindContext) {
  const matches: FindMatch[] = []
  await searchDirectory(
    context.root.absolutePath,
    context.root.relativePath,
    context,
    context.options,
    matches,
    1,
  )

  for (const match of matches) yield match
}

async function searchDirectory(
  absoluteDirectory: string,
  relativeDirectory: string,
  context: FindContext,
  options: FindOptions,
  matches: FindMatch[],
  depth: number,
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
      depth,
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
  depth: number,
) {
  const relativePath = joinRelative(relativeDirectory, name)
  if (isIgnoredSearchPath(context, relativePath)) return

  const absolutePath = path.join(absoluteDirectory, name)
  const entryStats = await safeEntryStats(absolutePath)
  if (!entryStats) return

  if (shouldSearchNames(options)) {
    addNameMatch(relativePath, name, entryStats, context, matches, options.entryType)
  }

  if (isDirectoryEntry(entryStats)) {
    await searchChildDirectory(absolutePath, relativePath, context, options, matches, depth)
    return
  }

  if (!canSearchFileContent(relativePath, entryStats, context, options)) return

  await addContentMatch(
    absolutePath,
    relativePath,
    entryStats,
    context.matcher,
    matches,
    options.limit,
    options.maxContentBytes,
  )
}

async function searchChildDirectory(
  absolutePath: string,
  relativePath: string,
  context: FindContext,
  options: FindOptions,
  matches: FindMatch[],
  depth: number,
) {
  if (!canSearchChildren(depth, options.maxDepth)) return

  await searchDirectory(absolutePath, relativePath, context, options, matches, depth + 1)
}

function canSearchChildren(depth: number, maxDepth?: number) {
  if (maxDepth === undefined) return true

  return depth < maxDepth
}

function canSearchFileContent(
  relativePath: string,
  entryStats: FsEntryStats,
  context: FindContext,
  options: FindOptions,
) {
  if (!matchesEntryType(entryStats, options.entryType)) return false
  if (!context.matcher.pathMatches(globMatchPath(context, relativePath))) return false
  if (!options.includeContent) return false
  if (!isFileEntry(entryStats)) return false
  if (entryStats.targetStats.size > options.maxContentBytes) return false

  return true
}

function addNameMatch(
  relativePath: string,
  name: string,
  entry: FsEntryStats,
  context: FindContext,
  matches: FindMatch[],
  entryType?: EntryTypeFilter,
) {
  if (!matchesEntryType(entry, entryType)) return
  if (!context.matcher.pathMatches(globMatchPath(context, relativePath))) return
  if (!nameSearchMatches(context, relativePath, name)) return

  matches.push({
    ...searchMatchMetadata(entry),
    kind: 'name',
    path: relativePath,
    source: 'disk',
    targetType: entry.targetType,
    type: entry.type,
  })
}

async function addContentMatch(
  absolutePath: string,
  relativePath: string,
  entry: FsEntryStats,
  matcher: WorkspaceSearchMatcher,
  matches: FindMatch[],
  limit: number,
  maxContentBytes: number,
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

      addLineMatch(relativePath, entry, line.text, lineIndex, matcher, matches, limit)
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
  recordRequestWarning('search fallback skipped file', {
    area: 'search',
    message,
    operation: 'fallback_content',
    path: relativePath,
  })
}

function addLineMatch(
  relativePath: string,
  entry: FsEntryStats,
  line: string,
  index: number,
  matcher: WorkspaceSearchMatcher,
  matches: FindMatch[],
  limit: number,
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
      }),
    )
  }
}
