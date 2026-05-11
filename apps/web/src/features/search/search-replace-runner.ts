import type { CachedEditorDocument } from "@/features/editor/state/editor-document-state"
import type { FileResult, TreeEntry } from "@/lib/file-system-types"
import type {
  WorkspaceSearchMatch,
  WorkspaceSearchQuery,
} from "@workspace/contracts"

import {
  applyWorkspaceSearchReplaceEdits,
  workspaceSearchReplacePlan,
} from "@/features/search/search-replace"

export type WorkspaceSearchReplaceResult = {
  changedFiles: number
  failedFiles: number
  replacedMatches: number
  skippedMatches: number
}

export type WorkspaceSearchReplaceContext = {
  cacheFile: (file: FileResult) => void
  fetchFile: (path: string, signal: AbortSignal) => Promise<FileResult>
  getCachedEditorDocument: (path: string) => CachedEditorDocument | null
  recordCachedEditorDocumentTextChange: (path: string) => void
  signal: AbortSignal
  writeFileContent: (
    path: string,
    content: string,
    expectedMtimeMs?: number | null
  ) => Promise<Pick<TreeEntry, "mtimeMs" | "size">>
}

type PathReplaceResult = {
  changed: boolean
  failed: boolean
  replacedMatches: number
  skippedMatches: number
}

export async function replaceWorkspaceSearchMatches({
  context,
  matches,
  query,
  replaceText,
}: {
  context: WorkspaceSearchReplaceContext
  matches: readonly WorkspaceSearchMatch[]
  query: WorkspaceSearchQuery
  replaceText: string
}): Promise<WorkspaceSearchReplaceResult> {
  const result = emptyReplaceResult()
  const matchesByPath = contentMatchesByPath(matches)

  for (const [path, pathMatches] of matchesByPath) {
    const pathResult = await replaceWorkspaceSearchPath({
      context,
      path,
      query,
      replaceText,
      matches: pathMatches,
    })
    appendPathResult(result, pathResult)
  }

  return result
}

export function workspaceSearchReplaceSummary(
  result: WorkspaceSearchReplaceResult
) {
  const replaced = `${result.replacedMatches.toLocaleString()} ${matchNoun(
    result.replacedMatches
  )} replaced`
  const skipped =
    result.skippedMatches > 0
      ? `, ${result.skippedMatches.toLocaleString()} skipped`
      : ""
  const failed =
    result.failedFiles > 0
      ? `, ${result.failedFiles.toLocaleString()} ${fileNoun(result.failedFiles)} failed`
      : ""

  return `${replaced}${skipped}${failed}.`
}

function emptyReplaceResult(): WorkspaceSearchReplaceResult {
  return {
    changedFiles: 0,
    failedFiles: 0,
    replacedMatches: 0,
    skippedMatches: 0,
  }
}

async function replaceWorkspaceSearchPath({
  context,
  matches,
  path,
  query,
  replaceText,
}: {
  context: WorkspaceSearchReplaceContext
  matches: readonly WorkspaceSearchMatch[]
  path: string
  query: WorkspaceSearchQuery
  replaceText: string
}): Promise<PathReplaceResult> {
  const cached = context.getCachedEditorDocument(path)
  if (cached) {
    return replaceCachedDocument(cached, matches, query, replaceText, context)
  }

  return replaceDiskFile(path, matches, query, replaceText, context)
}

function replaceCachedDocument(
  document: CachedEditorDocument,
  matches: readonly WorkspaceSearchMatch[],
  query: WorkspaceSearchQuery,
  replaceText: string,
  context: WorkspaceSearchReplaceContext
): PathReplaceResult {
  const plan = workspaceSearchReplacePlan({
    matches,
    query,
    replaceText,
    text: document.session.getText(),
  })
  if (plan.edits.length === 0) {
    return skippedPathResult(plan.skippedCount)
  }

  document.session.applyEdits(plan.edits)
  context.recordCachedEditorDocumentTextChange(document.path)

  return {
    changed: true,
    failed: false,
    replacedMatches: plan.appliedCount,
    skippedMatches: plan.skippedCount,
  }
}

async function replaceDiskFile(
  path: string,
  matches: readonly WorkspaceSearchMatch[],
  query: WorkspaceSearchQuery,
  replaceText: string,
  context: WorkspaceSearchReplaceContext
): Promise<PathReplaceResult> {
  try {
    return await replaceDiskFileChecked(
      path,
      matches,
      query,
      replaceText,
      context
    )
  } catch {
    return {
      changed: false,
      failed: true,
      replacedMatches: 0,
      skippedMatches: matches.length,
    }
  }
}

async function replaceDiskFileChecked(
  path: string,
  matches: readonly WorkspaceSearchMatch[],
  query: WorkspaceSearchQuery,
  replaceText: string,
  context: WorkspaceSearchReplaceContext
): Promise<PathReplaceResult> {
  const file = await context.fetchFile(path, context.signal)
  const plan = workspaceSearchReplacePlan({
    matches,
    query,
    replaceText,
    text: file.content,
  })
  if (plan.edits.length === 0) {
    return skippedPathResult(plan.skippedCount)
  }

  const content = applyWorkspaceSearchReplaceEdits(file.content, plan.edits)
  const entry = await context.writeFileContent(path, content, file.mtimeMs)
  context.cacheFile(fileResultForReplacedContent(file, content, entry))

  return {
    changed: true,
    failed: false,
    replacedMatches: plan.appliedCount,
    skippedMatches: plan.skippedCount,
  }
}

function skippedPathResult(skippedMatches: number): PathReplaceResult {
  return {
    changed: false,
    failed: false,
    replacedMatches: 0,
    skippedMatches,
  }
}

function appendPathResult(
  result: WorkspaceSearchReplaceResult,
  pathResult: PathReplaceResult
) {
  if (pathResult.changed) result.changedFiles += 1
  if (pathResult.failed) result.failedFiles += 1
  result.replacedMatches += pathResult.replacedMatches
  result.skippedMatches += pathResult.skippedMatches
}

function contentMatchesByPath(matches: readonly WorkspaceSearchMatch[]) {
  const groups = new Map<string, WorkspaceSearchMatch[]>()

  for (const match of matches) {
    if (match.kind !== "content") continue

    const group = groups.get(match.path)
    if (group) {
      group.push(match)
      continue
    }

    groups.set(match.path, [match])
  }

  return groups
}

function fileResultForReplacedContent(
  file: FileResult,
  content: string,
  entry: Pick<TreeEntry, "mtimeMs" | "size">
): FileResult {
  return {
    ...file,
    content,
    mtimeMs: entry.mtimeMs,
    size: entry.size,
  }
}

function matchNoun(count: number) {
  return count === 1 ? "match" : "matches"
}

function fileNoun(count: number) {
  return count === 1 ? "file" : "files"
}
