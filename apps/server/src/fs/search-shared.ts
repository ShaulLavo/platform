import path from "node:path"

import type {
  WorkspaceSearchMatcher,
  WorkspaceSearchMatch,
  WorkspaceSearchQuery,
} from "@workspace/contracts"

import { isIgnoredPath, toPosix } from "./path"
import { readEntryStats, type FsEntryStats } from "./stat"
import type { GitIgnoreMatcher } from "./search-gitignore"

const SEARCH_PREVIEW_CONTEXT_CHARS = 80
const SEARCH_PREVIEW_MAX_CHARS = 240

export type FindOptions = WorkspaceSearchQuery & {
  maxContentBytes: number
}

export type FindMatch = WorkspaceSearchMatch

export type FindContext = {
  root: {
    absolutePath: string
    relativePath: string
  }
  query: string
  matcher: WorkspaceSearchMatcher
  options: FindOptions
  gitIgnore: GitIgnoreMatcher
}

export function searchMatchMode(options: FindOptions) {
  return options.matchMode ?? "literal"
}

export function shouldSearchContent(options: FindOptions) {
  if (!options.includeContent) return false
  if (options.entryType && options.entryType !== "file") return false

  return true
}

export function shouldSearchNames(options: FindOptions) {
  return options.includeNames !== false
}

export function isIgnoredSearchPath(
  context: FindContext,
  relativePath: string
) {
  if (!relativePath) return false
  if (isIgnoredPath(relativePath)) return true

  return context.gitIgnore.ignores(relativePath)
}

export function nameSearchMatches(
  context: FindContext,
  relativePath: string,
  name = path.basename(relativePath)
) {
  if (context.matcher.lineMatches(name).length > 0) return true

  return (
    context.matcher.lineMatches(globMatchPath(context, relativePath)).length > 0
  )
}

export function contentMatch({
  columnIndex,
  endColumnIndex,
  entry,
  line,
  lineNumber,
  relativePath,
}: {
  columnIndex: number
  endColumnIndex: number
  entry: FsEntryStats
  line: string
  lineNumber: number
  relativePath: string
}): FindMatch {
  const preview = searchPreview(searchContentLineText(line), columnIndex)

  return {
    ...searchMatchMetadata(entry),
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

export function searchMatchMetadata(entry: FsEntryStats) {
  return {
    birthtimeMs: Number(entry.targetStats.birthtimeMs),
    mtimeMs: Number(entry.targetStats.mtimeMs),
    size: Number(entry.targetStats.size),
  }
}

export async function safeEntryStats(absolutePath: string) {
  try {
    return await readEntryStats(absolutePath)
  } catch {
    return null
  }
}

export function joinRelative(parent: string, child: string) {
  if (!parent) return child
  return toPosix(path.join(parent, child))
}

export function resultPath(rootRelativePath: string, output: string) {
  const cleanOutput = output.replace(/^\.\//, "").replace(/\/$/, "")
  if (!rootRelativePath) return toPosix(cleanOutput)

  return toPosix(path.join(rootRelativePath, cleanOutput))
}

export function globMatchPath(context: FindContext, relativePath: string) {
  if (!context.root.relativePath) return relativePath
  if (relativePath === context.root.relativePath) return ""

  const prefix = `${context.root.relativePath}/`
  if (!relativePath.startsWith(prefix)) return relativePath

  return relativePath.slice(prefix.length)
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
