export function openFilePathList(paths: readonly string[], path: string) {
  if (paths.includes(path)) return [...paths]

  return [...paths, path]
}

export function nextSelectedFilePath(
  openFilePaths: readonly string[],
  path: string
) {
  const closedIndex = openFilePaths.indexOf(path)
  if (closedIndex === -1) return null

  return (
    openFilePaths[closedIndex + 1] ?? openFilePaths[closedIndex - 1] ?? null
  )
}

export function renameOpenFilePath(
  paths: readonly string[],
  from: string,
  to: string
) {
  if (!paths.includes(from)) return [...paths]

  const renamed = paths.map((path) => (path === from ? to : path))
  return [...new Set(renamed)]
}
