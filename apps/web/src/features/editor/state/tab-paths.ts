export function nextSelectedFilePath(openFilePaths: readonly string[], path: string) {
  const closedIndex = openFilePaths.indexOf(path)
  if (closedIndex === -1) return null

  return openFilePaths[closedIndex + 1] ?? openFilePaths[closedIndex - 1] ?? null
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
