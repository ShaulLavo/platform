import type { EditorTabConflictMap, EditorTabModel } from '@/components/workspace/editor-tab-types'
import {
  conflictDiffDocumentLabel,
  conflictDiffDocumentTitle,
  parseConflictDiffDocumentId,
} from '@/features/editor/conflict-diff-document'
import type { EditorPaneTab } from '@/features/editor/state/editor-pane-state'
import {
  diffDocumentLabel,
  diffDocumentShortHash,
  diffDocumentTitle,
  parseDiffDocumentId,
} from '@/features/git/diff-document'
import { gitStatusSymbol, type GitSymbolSource } from '@/features/git/status-symbols'
import type { FileStatus, StatusPresentation } from '@/features/git/types'
import {
  parseSearchBufferDocumentId,
  searchBufferDocumentLabel,
  searchBufferDocumentTitle,
} from '@/features/search/search-buffer-document'
import { iconForEntry } from '@/lib/file-icons'
import { basename, displayPath } from '@/lib/path-formatters'

export const EMPTY_GIT_FILES: readonly FileStatus[] = []

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
  tab: EditorPaneTab
}): EditorTabModel {
  const path = tab.path
  const diffStatus = tabDiffStatus(path, gitFiles, rootPath)
  const diffHash = diffDocumentShortHash(path)
  const copyPath = tabCopyPath(path, conflicts)

  return {
    active: tab.id === selectedTabId,
    copyPath,
    copyRelativePath: tabRelativeCopyPath(copyPath, rootPath),
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

export function sameEditorTabModel(left: EditorTabModel, right: EditorTabModel) {
  if (left.active !== right.active) return false
  if (left.copyPath !== right.copyPath) return false
  if (left.copyRelativePath !== right.copyRelativePath) return false
  if (left.diffSuffix !== right.diffSuffix) return false
  if (left.icon.name !== right.icon.name) return false
  if (left.id !== right.id) return false
  if (left.name !== right.name) return false
  if (left.path !== right.path) return false
  if (left.title !== right.title) return false

  return sameDiffStatus(left.diffStatus, right.diffStatus)
}

function sameDiffStatus(left: StatusPresentation | null, right: StatusPresentation | null) {
  if (left?.className !== right?.className) return false
  if (left?.label !== right?.label) return false

  return left?.title === right?.title
}

function iconName(path: string, conflicts: EditorTabConflictMap) {
  const diff = parseDiffDocumentId(path)
  const searchBuffer = parseSearchBufferDocumentId(path)
  if (searchBuffer) return 'search.txt'
  if (diff) return basename(diff.path)
  const conflict = conflictForDocument(path, conflicts)
  if (conflict) return basename(conflict.remotePath)
  if (parseConflictDiffDocumentId(path)) return 'conflict.txt'

  return basename(path)
}

function tabName(path: string, conflicts: EditorTabConflictMap) {
  if (parseDiffDocumentId(path)) return diffDocumentLabel(path)
  if (parseSearchBufferDocumentId(path)) return searchBufferDocumentLabel()
  const conflict = conflictForDocument(path, conflicts)
  if (conflict) return conflictDiffDocumentLabel(conflict.remotePath)
  if (parseConflictDiffDocumentId(path)) return 'Conflict'

  return basename(path)
}

function tabTitle(path: string, conflicts: EditorTabConflictMap) {
  if (parseDiffDocumentId(path)) return diffDocumentTitle(path)
  const searchBuffer = parseSearchBufferDocumentId(path)
  if (searchBuffer) return searchBufferDocumentTitle(searchBuffer.rootPath)
  const conflict = conflictForDocument(path, conflicts)
  if (conflict) return conflictDiffDocumentTitle(conflict.remotePath)
  if (parseConflictDiffDocumentId(path)) return 'Filesystem conflict editor'

  return displayPath(path)
}

function tabCopyPath(path: string, conflicts: EditorTabConflictMap) {
  const diff = parseDiffDocumentId(path)
  if (diff) return diff.path

  const searchBuffer = parseSearchBufferDocumentId(path)
  if (searchBuffer) return searchBuffer.rootPath

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

function tabDiffStatus(
  path: string,
  files: readonly FileStatus[],
  rootPath: string,
): StatusPresentation | null {
  if (parseConflictDiffDocumentId(path)) return null
  if (parseSearchBufferDocumentId(path)) return null

  const diff = parseDiffDocumentId(path)
  if (!diff) return null

  const file = files.find((file) => diffStatusMatchesFile(diff, file, rootPath))
  const live = file ? liveSymbolForDiff(diff, file) : null
  if (live) return live
  if (diff.kind !== 'snapshot' || !diff.status) return null

  return gitStatusSymbol(diff.status, 'historical')
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

function diffStatusMatchesFile(
  diff: NonNullable<ReturnType<typeof parseDiffDocumentId>>,
  file: FileStatus,
  rootPath: string,
) {
  return pathSetsOverlap(diffStatusPaths(diff), statusPaths(file), rootPath)
}

function liveSymbolForDiff(
  diff: NonNullable<ReturnType<typeof parseDiffDocumentId>>,
  file: FileStatus,
) {
  const preferred = diff.kind === 'snapshot' ? diff.source : undefined
  const source = liveSymbolSource(file, preferred)
  if (!source) return null

  return gitStatusSymbol(statusForSymbolSource(file, source), source)
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

function diffStatusPaths(diff: NonNullable<ReturnType<typeof parseDiffDocumentId>>) {
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
