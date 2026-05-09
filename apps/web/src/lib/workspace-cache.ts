import type { PickedFsEntry } from "@/components/file-picker-dialog"
import {
  DEFAULT_DIFF_VIEW_MODE,
  isEditorDiffViewMode,
  type EditorDiffViewMode,
} from "@/features/editor/utils/diff-view-mode"
import { parseDiffDocumentId } from "@/features/git/diff-document"
import { reportError, toClientError } from "@/lib/client-error-taxonomy"
import * as v from "valibot"

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
  | {
      openFilePaths: string[]
      rootFolder: PickedFsEntry | null
      selectedFilePath: string | null
      version: 3
      workspacePanelTab: WorkspacePanelTab
    }
  | WorkspaceCachePayloadV4

type WorkspaceCachePayloadV4 = {
  diffViewMode: EditorDiffViewMode
  openFilePaths: string[]
  rootFolder: PickedFsEntry | null
  selectedFilePath: string | null
  version: 4
  workspacePanelTab: WorkspacePanelTab
}

export type WorkspacePanelTab = "files" | "git"

const pickedDirectorySchema = v.object({
  birthtimeMs: v.number(),
  mtimeMs: v.number(),
  name: v.string(),
  path: v.string(),
  size: v.number(),
  type: v.literal("directory"),
})
const rootFolderSchema = v.nullable(pickedDirectorySchema)
const selectedFilePathSchema = v.nullable(v.string())
const workspacePanelTabSchema = v.union([v.literal("files"), v.literal("git")])
const diffViewModeSchema = v.custom<EditorDiffViewMode>(isEditorDiffViewMode)
const v1Schema = v.object({
  rootFolder: rootFolderSchema,
  selectedFilePath: selectedFilePathSchema,
  version: v.literal(1),
})
const v2Schema = v.object({
  openFilePaths: v.array(v.string()),
  rootFolder: rootFolderSchema,
  selectedFilePath: selectedFilePathSchema,
  version: v.literal(2),
})
const v3Schema = v.object({
  openFilePaths: v.array(v.string()),
  rootFolder: rootFolderSchema,
  selectedFilePath: selectedFilePathSchema,
  version: v.literal(3),
  workspacePanelTab: workspacePanelTabSchema,
})
const v4Schema = v.object({
  diffViewMode: diffViewModeSchema,
  openFilePaths: v.array(v.string()),
  rootFolder: rootFolderSchema,
  selectedFilePath: selectedFilePathSchema,
  version: v.literal(4),
  workspacePanelTab: workspacePanelTabSchema,
})
const workspaceCachePayloadSchema = v.variant("version", [
  v1Schema,
  v2Schema,
  v3Schema,
  v4Schema,
])

export type CachedWorkspaceState = {
  diffViewMode: EditorDiffViewMode
  openFilePaths: string[]
  rootFolder: PickedFsEntry | null
  selectedFilePath: string | null
  workspacePanelTab: WorkspacePanelTab
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
  workspacePanelTab,
  diffViewMode,
}: CachedWorkspaceState) {
  if (!canUseLocalStorage()) return

  try {
    const selectedPath = selectedPathForWorkspace(rootFolder, selectedFilePath)
    const payload: WorkspaceCachePayloadV4 = {
      diffViewMode,
      openFilePaths: openPathsForWorkspace(
        rootFolder,
        openFilePaths,
        selectedPath
      ),
      rootFolder,
      selectedFilePath: selectedPath,
      version: 4,
      workspacePanelTab,
    }

    localStorage.setItem(CACHE_KEY, JSON.stringify(payload))
  } catch {}
}

function readCachePayload() {
  if (!canUseLocalStorage()) return null

  try {
    const value = localStorage.getItem(CACHE_KEY)
    if (!value) return null

    const payload = parseCachePayload(value)
    if (payload) return payload

    localStorage.removeItem(CACHE_KEY)
    reportError(toClientError({ code: "INVALID_PATH" }))
    return null
  } catch (error) {
    localStorage.removeItem(CACHE_KEY)
    reportError(toClientError({ code: "OPERATION_FAILED", error }))
    return null
  }
}

function parseCachePayload(value: string): WorkspaceCachePayload | null {
  const parsed: unknown = JSON.parse(value)
  const result = v.safeParse(workspaceCachePayloadSchema, parsed)
  if (!result.success) return null

  return result.output
}

function workspaceStateFromPayload(
  payload: WorkspaceCachePayload
): CachedWorkspaceState {
  const selectedFilePath = selectedPathForWorkspace(
    payload.rootFolder,
    payload.selectedFilePath
  )
  const payloadOpenPaths =
    payload.version === 1
      ? selectedFilePathForArray(selectedFilePath)
      : payload.openFilePaths

  return {
    diffViewMode:
      payload.version === 4 ? payload.diffViewMode : DEFAULT_DIFF_VIEW_MODE,
    openFilePaths: openPathsForWorkspace(
      payload.rootFolder,
      payloadOpenPaths,
      selectedFilePath
    ),
    rootFolder: payload.rootFolder,
    selectedFilePath,
    workspacePanelTab: workspacePanelTabFromPayload(payload),
  }
}

function workspacePanelTabFromPayload(payload: WorkspaceCachePayload) {
  if (payload.version === 3 || payload.version === 4) {
    return payload.workspacePanelTab
  }

  return "files"
}

function selectedPathForWorkspace(
  rootFolder: PickedFsEntry | null,
  selectedFilePath: string | null
) {
  if (!rootFolder) return null
  if (!selectedFilePath) return null
  if (
    isPathInWorkspace(
      backingPathForWorkspace(selectedFilePath),
      rootFolder.path
    )
  ) {
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

  return isPathInWorkspace(backingPathForWorkspace(path), rootFolder.path)
}

function backingPathForWorkspace(path: string) {
  const diff = parseDiffDocumentId(path)
  if (diff) return diff.path

  return path
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
    diffViewMode: DEFAULT_DIFF_VIEW_MODE,
    openFilePaths: [],
    rootFolder: null,
    selectedFilePath: null,
    workspacePanelTab: "files",
  }
}

function canUseLocalStorage() {
  return typeof localStorage !== "undefined"
}
