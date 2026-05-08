import type { PickedFsEntry } from "@/components/file-picker-dialog"

const CACHE_KEY = "platform.workspace-state.v1"

type WorkspaceCachePayload = {
  rootFolder: PickedFsEntry | null
  selectedFilePath: string | null
  version: 1
}

export type CachedWorkspaceState = {
  rootFolder: PickedFsEntry | null
  selectedFilePath: string | null
}

export function readWorkspaceCache(): CachedWorkspaceState {
  const payload = readCachePayload()
  if (!payload) return emptyWorkspaceState()

  return {
    rootFolder: payload.rootFolder,
    selectedFilePath: selectedPathForWorkspace(
      payload.rootFolder,
      payload.selectedFilePath
    ),
  }
}

export function writeWorkspaceCache({
  rootFolder,
  selectedFilePath,
}: CachedWorkspaceState) {
  if (!canUseLocalStorage()) return

  try {
    const payload: WorkspaceCachePayload = {
      rootFolder,
      selectedFilePath: selectedPathForWorkspace(rootFolder, selectedFilePath),
      version: 1,
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
  if (!("version" in value) || value.version !== 1) return false
  if (!("rootFolder" in value)) return false
  if (!("selectedFilePath" in value)) return false

  return (
    isOptionalPickedDirectory(value.rootFolder) &&
    isOptionalString(value.selectedFilePath)
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

function isPathInWorkspace(path: string, rootPath: string) {
  if (!rootPath) return true
  if (path === rootPath) return true

  return path.startsWith(`${rootPath}/`)
}

function emptyWorkspaceState(): CachedWorkspaceState {
  return {
    rootFolder: null,
    selectedFilePath: null,
  }
}

function canUseLocalStorage() {
  return typeof localStorage !== "undefined"
}
