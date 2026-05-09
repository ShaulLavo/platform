export type WorkspaceFilesystemEvent =
  | { type: "created"; path: string }
  | { type: "changed"; path: string }
  | { type: "deleted"; path: string }
  | { type: "renamed"; path: string; oldPath: string }

export function affectedOpenFileRefreshPaths(
  events: readonly WorkspaceFilesystemEvent[],
  openFilePaths: readonly string[],
  recreatedPaths: ReadonlySet<string>,
  rootPath: string
) {
  const affectedDirectories = new Set<string>()
  const deletedPaths = new Set<string>()
  const exactPaths = new Set<string>()
  const exactDirectories = new Set<string>()
  const openPathSet = new Set(openFilePaths)

  for (const event of events) {
    if (event.type === "deleted") {
      deletedPaths.add(event.path)
      continue
    }
    if (event.type === "renamed") continue
    if (openPathSet.has(event.path)) {
      exactPaths.add(event.path)
      exactDirectories.add(parentPath(event.path, rootPath))
      continue
    }
    if (!isLikelyTemporarySavePath(event.path)) continue

    affectedDirectories.add(parentPath(event.path, rootPath))
  }

  const fallbackPaths = openFilePaths.filter((path) =>
    shouldRefreshFallbackPath(
      path,
      rootPath,
      affectedDirectories,
      exactDirectories,
      deletedPaths,
      recreatedPaths,
      exactPaths
    )
  )

  return [...exactPaths, ...fallbackPaths]
}

function shouldRefreshFallbackPath(
  path: string,
  rootPath: string,
  affectedDirectories: ReadonlySet<string>,
  exactDirectories: ReadonlySet<string>,
  deletedPaths: ReadonlySet<string>,
  recreatedPaths: ReadonlySet<string>,
  exactPaths: ReadonlySet<string>
) {
  if (exactPaths.has(path)) return false
  if (!recreatedPaths.has(path) && isWithinAnyPath(path, deletedPaths))
    return false

  const directory = parentPath(path, rootPath)
  if (exactDirectories.has(directory)) return false

  return affectedDirectories.has(directory)
}

function isLikelyTemporarySavePath(path: string) {
  const name = path.split("/").at(-1) ?? path
  if (name.endsWith("~")) return true
  if (name.startsWith(".") && name.includes(".tmp")) return true
  if (name.endsWith(".tmp")) return true
  if (name.endsWith(".swp")) return true
  if (name.endsWith(".swx")) return true
  if (name.endsWith(".part")) return true

  return false
}

function parentPath(path: string, rootPath: string) {
  if (path === rootPath) return rootPath

  const index = path.lastIndexOf("/")
  if (index < 0) return rootPath

  return path.slice(0, index)
}

function isWithinAnyPath(path: string, parents: ReadonlySet<string>) {
  for (const parent of parents) {
    if (isSameOrChildPath(path, parent)) return true
  }

  return false
}

function isSameOrChildPath(path: string, parent: string) {
  return path === parent || path.startsWith(`${parent}/`)
}
