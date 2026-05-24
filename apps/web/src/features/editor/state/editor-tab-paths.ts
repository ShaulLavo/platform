export function openFilePathList(paths: readonly string[], path: string) {
  if (paths.includes(path)) return paths

  return paths.concat(path)
}

export function nextSelectedFilePath(openFilePaths: readonly string[], path: string) {
  const closedIndex = openFilePaths.indexOf(path)
  if (closedIndex === -1) return null

  return openFilePaths[closedIndex + 1] ?? openFilePaths[closedIndex - 1] ?? null
}

export function renameOpenFilePath(paths: readonly string[], from: string, to: string) {
  if (from === to) return paths
  if (!paths.includes(from)) return paths

  const renamed = paths.map((path) => (path === from ? to : path))
  return Array.from(new Set(renamed))
}

export function reorderOpenFilePath(paths: readonly string[], path: string, targetIndex: number) {
  const sourceIndex = paths.indexOf(path)
  if (sourceIndex === -1) return paths

  const remainingPaths = paths.filter((candidate) => candidate !== path)
  const insertIndex = boundedOpenFilePathInsertIndex(targetIndex, remainingPaths.length)
  const reordered = remainingPaths
    .slice(0, insertIndex)
    .concat(path, remainingPaths.slice(insertIndex))

  if (samePathOrder(paths, reordered)) return paths

  return reordered
}

const MAX_EDITOR_HISTORY = 50

export function editorHistoryForSelection(paths: readonly string[], selectedPath: string | null) {
  if (!selectedPath) return Array.from(paths)

  return uniqueRecentPaths([selectedPath].concat(paths))
}

export function editorHistoryForClosedPath(paths: readonly string[], closedPath: string) {
  return paths.filter((path) => path !== closedPath)
}

export function editorHistoryForRenamedPath(paths: readonly string[], from: string, to: string) {
  return uniqueRecentPaths(paths.map((path) => (path === from ? to : path)))
}

export function recentlyClosedEditorPathsForClose(paths: readonly string[], closedPath: string) {
  return uniqueRecentPaths([closedPath].concat(paths))
}

export function recentlyClosedEditorPathsForReopen(paths: readonly string[], reopenedPath: string) {
  return paths.filter((path) => path !== reopenedPath)
}

export function previousOpenEditorPath(
  history: readonly string[],
  openFilePaths: readonly string[],
  selectedPath: string | null,
) {
  const openPaths = new Set(openFilePaths)
  for (const path of history) {
    if (path === selectedPath) continue
    if (!openPaths.has(path)) continue

    return path
  }

  return null
}

function uniqueRecentPaths(paths: readonly string[]) {
  return Array.from(new Set(paths)).slice(0, MAX_EDITOR_HISTORY)
}

function samePathOrder(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false

  return left.every((path, index) => path === right[index])
}

function boundedOpenFilePathInsertIndex(index: number, pathCount: number) {
  if (!Number.isFinite(index)) return pathCount

  const integerIndex = Math.trunc(index)
  return Math.min(pathCount, Math.max(0, integerIndex))
}
