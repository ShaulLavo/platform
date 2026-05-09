import type { PickedFsEntry } from "@/components/file-picker-dialog"

const CACHE_KEY = "platform.workspace-state.v1"

type WorkspaceCachePayload =
  | {
      rootFolder: PickedFsEntry | null
      selectedFilePath: string | null
      version: 1
    }
  | {
      openFilePaths: string[]
      rootFolder: PickedFsEntry | null
      selectedFilePath: string | null
      version: 2
    }

type WorkspaceCachePayloadV2 = {
  openFilePaths: string[]
  rootFolder: PickedFsEntry | null
  selectedFilePath: string | null
  version: 2
}

export type CachedWorkspaceState = {
  openFilePaths: string[]
  rootFolder: PickedFsEntry | null
  selectedFilePath: string | null
}

export function readWorkspaceCache(): CachedWorkspaceState {
  const payload = readCachePayload()
  if (!payload) return emptyWorkspaceState()

  return workspaceStateFromPayload(payload)
}

export function writeWorkspaceCache({
  openFilePaths,
  rootFolder,
  selectedFilePath,
}: CachedWorkspaceState) {
  if (!canUseLocalStorage()) return

  try {
    const selectedPath = selectedPathForWorkspace(rootFolder, selectedFilePath)
    const payload: WorkspaceCachePayloadV2 = {
      openFilePaths: openPathsForWorkspace(
        rootFolder,
        openFilePaths,
        selectedPath
      ),
      rootFolder,
      selectedFilePath: selectedPath,
      version: 2,
    }

    localStorage.setItem(CACHE_KEY, JSON.stringify(payload))
  } catch {
    // Ignore private-mode or quota failures; the app should still open normally.
  }
}

function readCachePayload() {
  if (!canUseLocalStorage()) return null

  try {
    return parseCachePayload(localStorage.getItem(CACHE_KEY))
  } catch {
    localStorage.removeItem(CACHE_KEY)
    return null
  }
}

function parseCachePayload(value: string | null): WorkspaceCachePayload | null {
  if (!value) return null

  const parsed: unknown = JSON.parse(value)
  if (!isCachePayload(parsed)) return null

  return parsed
}

function isCachePayload(value: unknown): value is WorkspaceCachePayload {
  if (!value || typeof value !== "object") return false
  if (!("version" in value)) return false
  if (value.version !== 1 && value.version !== 2) return false
  if (!("rootFolder" in value)) return false
  if (!("selectedFilePath" in value)) return false
  if (value.version === 2 && !("openFilePaths" in value)) return false

  return (
    isOptionalPickedDirectory(value.rootFolder) &&
    isOptionalString(value.selectedFilePath) &&
    (value.version === 1 || isStringArray(value.openFilePaths))
  )
}

function isOptionalPickedDirectory(
  value: unknown
): value is PickedFsEntry | null {
  return value === null || isPickedDirectory(value)
}

function isPickedDirectory(value: unknown): value is PickedFsEntry {
  if (!value || typeof value !== "object") return false
  if (!("type" in value) || value.type !== "directory") return false
  if (!("name" in value) || typeof value.name !== "string") return false
  if (!("path" in value) || typeof value.path !== "string") return false
  if (!("size" in value) || typeof value.size !== "number") return false
  if (!("mtimeMs" in value) || typeof value.mtimeMs !== "number") return false
  if (!("birthtimeMs" in value) || typeof value.birthtimeMs !== "number") {
    return false
  }

  return true
}

function isOptionalString(value: unknown): value is string | null {
  return value === null || typeof value === "string"
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

function workspaceStateFromPayload(
  payload: WorkspaceCachePayload
): CachedWorkspaceState {
  const selectedFilePath = selectedPathForWorkspace(
    payload.rootFolder,
    payload.selectedFilePath
  )
  const payloadOpenPaths =
    payload.version === 2
      ? payload.openFilePaths
      : selectedFilePathForArray(selectedFilePath)

  return {
    openFilePaths: openPathsForWorkspace(
      payload.rootFolder,
      payloadOpenPaths,
      selectedFilePath
    ),
    rootFolder: payload.rootFolder,
    selectedFilePath,
  }
}

function selectedPathForWorkspace(
  rootFolder: PickedFsEntry | null,
  selectedFilePath: string | null
) {
  if (!rootFolder) return null
  if (!selectedFilePath) return null
  if (isPathInWorkspace(selectedFilePath, rootFolder.path)) {
    return selectedFilePath
  }

  return null
}

function openPathsForWorkspace(
  rootFolder: PickedFsEntry | null,
  openFilePaths: readonly string[],
  selectedFilePath: string | null
) {
  const validPaths = openFilePaths.filter((path) =>
    pathForWorkspace(rootFolder, path)
  )
  const uniquePaths = [...new Set(validPaths)]
  if (!selectedFilePath) return uniquePaths
  if (uniquePaths.includes(selectedFilePath)) return uniquePaths

  return [...uniquePaths, selectedFilePath]
}

function pathForWorkspace(rootFolder: PickedFsEntry | null, path: string) {
  if (!rootFolder) return false

  return isPathInWorkspace(path, rootFolder.path)
}

function isPathInWorkspace(path: string, rootPath: string) {
  if (!rootPath) return true
  if (path === rootPath) return true

  return path.startsWith(`${rootPath}/`)
}

function selectedFilePathForArray(selectedFilePath: string | null) {
  return selectedFilePath ? [selectedFilePath] : []
}

function emptyWorkspaceState(): CachedWorkspaceState {
  return {
    openFilePaths: [],
    rootFolder: null,
    selectedFilePath: null,
  }
}

function canUseLocalStorage() {
  return typeof localStorage !== "undefined"
}
