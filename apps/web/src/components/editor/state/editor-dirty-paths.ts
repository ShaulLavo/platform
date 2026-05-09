export function updateDirtyFilePaths(
  paths: ReadonlySet<string>,
  path: string,
  dirty: boolean
) {
  if (dirty && paths.has(path)) return null
  if (!dirty && !paths.has(path)) return null

  const nextPaths = new Set(paths)
  if (dirty) {
    nextPaths.add(path)
    return nextPaths
  }

  nextPaths.delete(path)
  return nextPaths
}

export function removeDirtyFilePath(paths: ReadonlySet<string>, path: string) {
  return updateDirtyFilePaths(paths, path, false)
}

export function renameDirtyFilePath(
  paths: ReadonlySet<string>,
  from: string,
  to: string
) {
  if (!paths.has(from)) return paths

  const nextPaths = new Set(paths)
  nextPaths.delete(from)
  nextPaths.add(to)
  return nextPaths
}
