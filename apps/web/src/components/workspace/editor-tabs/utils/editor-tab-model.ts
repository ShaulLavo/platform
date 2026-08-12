import type {
  EditorTabConflictMap,
  EditorTabDiffSource,
  EditorTabModel,
} from '@/components/workspace/editor-tabs/utils/editor-tab-types'
import {
  conflictDiffDocumentLabel,
  conflictDiffDocumentTitle,
  parseConflictDiffDocumentId,
} from '@/features/editor/conflict-diff-document'
import { parseCompareSavedDocumentId } from '@/features/editor/compare-saved-document'
import { parseRefDocumentId } from '@/features/git/ref-document'
import { documentLabel } from '@/components/workspace/editor-tabs/utils/document-label'
import {
  diffDocumentShortHash,
  diffDocumentTitle,
  parseDiffDocumentId,
  type DiffDocumentInfo,
} from '@/features/git/diff-document'
import { gitStatusSymbol, type GitSymbolSource } from '@/features/git/status-symbols'
import type { FileStatus } from '@/features/git/types'
import {
  parseSearchBufferDocumentId,
  searchBufferDocumentTitle,
} from '@/features/search/search-buffer-document'
import { iconForEntry } from '@/lib/file-icons'
import { basename, displayPath } from '@/lib/path-formatters'

export const EMPTY_GIT_FILES: readonly FileStatus[] = []

export type EditorSplitDirection = 'horizontal' | 'vertical'
export type EditorSnapZone = 'bottom' | 'center' | 'left' | 'right' | 'top'
export type EditorSplitScope = 'pane' | 'root'

export type EditorTabRecord = {
  readonly id: string
  readonly path: string
}

// Tab ids are persisted with the workspace layout, so they must stay unique
// across reloads and HMR — a counter here resets and collides with restored
// ids, routing tab clicks to the wrong surface.
// TODO: replace crypto.randomUUID with fast-ulid.
export function createEditorTabRecord(path: string): EditorTabRecord {
  return {
    id: `editor-tab:${crypto.randomUUID()}`,
    path,
  }
}

export function editorTabModel({
  conflicts,
  gitFiles,
  rootPath,
  selectedTabId,
  tab,
}: {
  conflicts: EditorTabConflictMap
  gitFiles: readonly FileStatus[]
  rootPath: string
  selectedTabId: string | null
  tab: EditorTabRecord
}): EditorTabModel {
  const path = tab.path
  const diffChange = tabDiffChange(path, gitFiles, rootPath)
  const diffStatus = diffChange ? gitStatusSymbol(diffChange.status, diffChange.source) : null
  const diffHash = diffDocumentShortHash(path)
  const copyPath = tabCopyPath(path, conflicts)

  return {
    active: tab.id === selectedTabId,
    copyPath,
    copyRelativePath: tabRelativeCopyPath(copyPath, rootPath),
    diffSource: tabDiffSource(path, conflicts, diffChange),
    diffStatus,
    diffSuffix: tabDiffSuffix(diffHash, diffStatus?.label),
    id: tab.id,
    icon: iconForEntry({
      name: iconName(path, conflicts),
      type: 'file',
    }),
    name: tabName(path, conflicts),
    path,
    title: tabTitle(path, conflicts),
  }
}

function iconName(path: string, conflicts: EditorTabConflictMap) {
  const diff = parseDiffDocumentId(path)
  const searchBuffer = parseSearchBufferDocumentId(path)
  if (searchBuffer) return 'search.txt'
  if (diff) return basename(diff.path)
  const conflict = conflictForDocument(path, conflicts)
  if (conflict) return basename(conflict.remotePath)
  if (parseConflictDiffDocumentId(path)) return 'conflict.txt'
  const compared = parseCompareSavedDocumentId(path)
  if (compared) return basename(compared)
  const atRef = parseRefDocumentId(path)
  if (atRef) return basename(atRef.path)

  return basename(path)
}

function tabName(path: string, conflicts: EditorTabConflictMap) {
  const conflict = conflictForDocument(path, conflicts)
  if (conflict) return conflictDiffDocumentLabel(conflict.remotePath)

  return documentLabel(path)
}

function tabTitle(path: string, conflicts: EditorTabConflictMap) {
  if (parseDiffDocumentId(path)) return diffDocumentTitle(path)
  const searchBuffer = parseSearchBufferDocumentId(path)
  if (searchBuffer) return searchBufferDocumentTitle(searchBuffer.rootPath)
  const conflict = conflictForDocument(path, conflicts)
  if (conflict) return conflictDiffDocumentTitle(conflict.remotePath)
  if (parseConflictDiffDocumentId(path)) return 'Filesystem conflict editor'
  const comparedTitle = parseCompareSavedDocumentId(path)
  if (comparedTitle) return `${displayPath(comparedTitle)} — working tree vs saved`
  const atRefTitle = parseRefDocumentId(path)
  if (atRefTitle) return `${displayPath(atRefTitle.path)} at ${atRefTitle.ref}`

  return displayPath(path)
}

function tabCopyPath(path: string, conflicts: EditorTabConflictMap) {
  const diff = parseDiffDocumentId(path)
  if (diff) return diff.path

  const searchBuffer = parseSearchBufferDocumentId(path)
  if (searchBuffer) return searchBuffer.rootPath

  const compared = parseCompareSavedDocumentId(path)
  if (compared) return compared

  const atRef = parseRefDocumentId(path)
  if (atRef) return atRef.path

  const conflict = conflictForDocument(path, conflicts)
  if (conflict) return conflict.remotePath

  return path
}

function tabRelativeCopyPath(path: string, rootPath: string) {
  const normalizedPath = normalizedCopyPath(path)
  const normalizedRoot = normalizedCopyPath(rootPath)
  if (!normalizedRoot) return normalizedPath
  if (normalizedPath === normalizedRoot) return basename(normalizedPath)

  const rootPrefix = `${normalizedRoot}/`
  if (!normalizedPath.startsWith(rootPrefix)) return normalizedPath

  return normalizedPath.slice(rootPrefix.length)
}

function normalizedCopyPath(path: string) {
  if (path === '/') return path

  return path.replace(/\/+$/u, '')
}

type TabDiffChange = {
  source: GitSymbolSource
  status: FileStatus['index'] | FileStatus['worktree']
}

function tabDiffChange(
  path: string,
  files: readonly FileStatus[],
  rootPath: string,
): TabDiffChange | null {
  if (parseConflictDiffDocumentId(path)) return null
  if (parseSearchBufferDocumentId(path)) return null

  const diff = parseDiffDocumentId(path)
  if (!diff) return null

  const file = files.find((file) => diffStatusMatchesFile(diff, file, rootPath))
  const live = file ? liveChangeForDiff(diff, file) : null
  if (live) return live
  if (diff.kind !== 'snapshot' || !diff.status) return null

  return { source: 'historical', status: diff.status }
}

/**
 * A diff tab knows which file it is showing, so the tab menu can jump to it.
 * Thread and turn checkpoint diffs span many files and have no single target.
 */
function tabDiffSource(
  path: string,
  conflicts: EditorTabConflictMap,
  change: TabDiffChange | null,
): EditorTabDiffSource | null {
  const conflict = conflictForDocument(path, conflicts)
  if (conflict) return { onDisk: true, path: conflict.remotePath }

  const diff = parseDiffDocumentId(path)
  if (!diff) return null

  const sourcePath = diffSourcePath(diff)
  if (!sourcePath) return null

  return { onDisk: change?.status !== 'deleted', path: sourcePath }
}

function diffSourcePath(diff: DiffDocumentInfo) {
  if (diff.kind === 'snapshot') return diff.path
  if ((diff.query.scope ?? 'file') !== 'file') return null

  return diff.query.filePath ?? diff.path
}

function conflictForDocument(path: string | null | undefined, conflicts: EditorTabConflictMap) {
  const conflictDiff = parseConflictDiffDocumentId(path)
  if (!conflictDiff) return null

  return conflicts[conflictDiff.conflictId] ?? null
}

function tabDiffSuffix(hash: string, status: string | undefined) {
  if (!hash) return ''
  if (!status) return `(${hash})`

  return `(${hash} ${status})`
}

function diffStatusMatchesFile(diff: DiffDocumentInfo, file: FileStatus, rootPath: string) {
  return pathSetsOverlap(diffStatusPaths(diff), statusPaths(file), rootPath)
}

function liveChangeForDiff(diff: DiffDocumentInfo, file: FileStatus): TabDiffChange | null {
  const preferred = diff.kind === 'snapshot' ? diff.source : undefined
  const source = liveSymbolSource(file, preferred)
  if (!source) return null

  return { source, status: statusForSymbolSource(file, source) }
}

function liveSymbolSource(
  file: FileStatus,
  preferred: GitSymbolSource | undefined,
): GitSymbolSource | null {
  if (preferred === 'staged' && isStagedStatus(file.index)) return 'staged'
  if (preferred === 'worktree' && isWorktreeStatus(file.worktree)) return 'worktree'
  if (isStagedStatus(file.index)) return 'staged'
  if (isWorktreeStatus(file.worktree)) return 'worktree'

  return null
}

function statusForSymbolSource(file: FileStatus, source: GitSymbolSource) {
  if (source === 'staged') return file.index
  if (source === 'worktree') return file.worktree

  return file.status
}

function isStagedStatus(status: FileStatus['index']) {
  return status !== 'unmodified' && status !== 'untracked'
}

function isWorktreeStatus(status: FileStatus['worktree']) {
  return status !== 'unmodified'
}

function diffStatusPaths(diff: DiffDocumentInfo) {
  return [diff.path, diff.query.oldPath].filter(isPresentPath)
}

function statusPaths(file: FileStatus) {
  return [file.path, file.oldPath].filter(isPresentPath)
}

function isPresentPath(path: string | undefined): path is string {
  return Boolean(path)
}

function pathSetsOverlap(left: readonly string[], right: readonly string[], rootPath: string) {
  const normalizedRight = new Set(right.flatMap((path) => comparablePaths(path, rootPath)))

  return left.some((path) =>
    comparablePaths(path, rootPath).some((candidate) => normalizedRight.has(candidate)),
  )
}

function comparablePaths(path: string, rootPath: string) {
  const normalized = normalizePath(path)
  const root = normalizePath(rootPath)
  const paths = [normalized, stripLeadingSlash(normalized)]
  const rootPrefix = `${root}/`

  if (root && normalized.startsWith(rootPrefix)) {
    paths.push(normalized.slice(rootPrefix.length))
  }

  return Array.from(new Set(paths.filter(Boolean)))
}

function normalizePath(path: string) {
  return path.replace(/\/+/gu, '/').replace(/\/$/u, '')
}

function stripLeadingSlash(path: string) {
  return path.startsWith('/') ? path.slice(1) : path
}
