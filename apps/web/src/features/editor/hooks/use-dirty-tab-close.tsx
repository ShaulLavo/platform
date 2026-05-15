import { useCallback, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { UnsavedChangesDialog } from "@/features/editor/components/unsaved-changes-dialog"
import {
  fileBackedEditorPath,
  isDirtyCachedEditorDocument,
  saveEditorDocumentByPath,
} from "@/features/editor/editor-save"
import { useEditorCommands } from "@/features/editor/state/editor-commands"
import { useEditorDocumentStoreApi } from "@/features/editor/state/editor-document-state"
import { useEditorWorkspaceStoreApi } from "@/features/editor/state/editor-workspace-state"
import { errorMessage } from "@/lib/file-server"

export type RequestCloseTab = (path: string) => boolean
export type RequestCloseTabs = (paths: readonly string[]) => boolean

export function useDirtyTabCloseRequest() {
  const documentStore = useEditorDocumentStoreApi()
  const workspaceStore = useEditorWorkspaceStoreApi()
  const queryClient = useQueryClient()
  const { closeTab, discardAndCloseTab } = useEditorCommands()
  const [pendingPaths, setPendingPaths] = useState<readonly string[]>([])
  const pendingPath = pendingPaths[0] ?? null
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const canSavePendingPath = fileBackedEditorPath(pendingPath) !== null

  const clearPendingClose = useCallback(() => {
    setPendingPaths([])
    setSaveError(null)
  }, [])

  const advancePendingClose = useCallback(() => {
    setPendingPaths((paths) => paths.slice(1))
    setSaveError(null)
  }, [])

  const requestCloseTabs = useCallback<RequestCloseTabs>(
    (paths) => {
      if (pendingPaths.length > 0) return false

      const openPaths = uniqueOpenPaths(paths, workspaceStore.getState())
      if (openPaths.length === 0) return false
      const state = documentStore.getState()

      const dirtyPaths: string[] = []
      for (const path of openPaths) {
        if (isDirtyCachedEditorDocument(state, path)) {
          dirtyPaths.push(path)
          continue
        }

        closeTab(path)
      }

      setPendingPaths(dirtyPaths)
      setSaveError(null)

      return dirtyPaths.length === 0
    },
    [closeTab, documentStore, pendingPaths.length, workspaceStore]
  )

  const requestCloseTab = useCallback<RequestCloseTab>(
    (path) => requestCloseTabs([path]),
    [requestCloseTabs]
  )

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) return
      if (saving) return

      clearPendingClose()
    },
    [clearPendingClose, saving]
  )

  const handleCancel = useCallback(() => {
    if (saving) return

    clearPendingClose()
  }, [clearPendingClose, saving])

  const handleDiscard = useCallback(() => {
    if (!pendingPath) return
    if (saving) return
    if (!workspaceStore.getState().openFilePaths.includes(pendingPath)) {
      advancePendingClose()
      return
    }

    discardAndCloseTab(pendingPath)
    advancePendingClose()
  }, [
    advancePendingClose,
    discardAndCloseTab,
    pendingPath,
    saving,
    workspaceStore,
  ])

  const handleSave = useCallback(() => {
    if (!pendingPath) return
    if (saving) return

    void saveAndClosePendingTab(pendingPath, {
      advancePendingClose,
      closeTab,
      documentStore,
      queryClient,
      setSaveError,
      setSaving,
      workspaceStore,
    })
  }, [
    advancePendingClose,
    closeTab,
    documentStore,
    pendingPath,
    queryClient,
    saving,
    workspaceStore,
  ])

  return {
    dirtyTabCloseDialog: (
      <UnsavedChangesDialog
        canSave={canSavePendingPath}
        error={saveError}
        open={pendingPath !== null}
        path={pendingPath}
        saving={saving}
        onCancel={handleCancel}
        onDiscard={handleDiscard}
        onOpenChange={handleOpenChange}
        onSave={handleSave}
      />
    ),
    requestCloseTab,
    requestCloseTabs,
  }
}

async function saveAndClosePendingTab(
  path: string,
  context: SaveAndCloseContext
) {
  context.setSaving(true)
  context.setSaveError(null)

  try {
    if (!context.workspaceStore.getState().openFilePaths.includes(path)) {
      context.advancePendingClose()
      return
    }

    const saved = await saveEditorDocumentByPath(
      context.documentStore,
      context.queryClient,
      path
    )
    if (!saved) {
      context.setSaveError("This tab could not be saved.")
      return
    }

    context.closeTab(path)
    context.advancePendingClose()
  } catch (error: unknown) {
    context.setSaveError(errorMessage(error))
  } finally {
    context.setSaving(false)
  }
}

type SaveAndCloseContext = {
  advancePendingClose: () => void
  closeTab: (path: string) => void
  documentStore: ReturnType<typeof useEditorDocumentStoreApi>
  queryClient: ReturnType<typeof useQueryClient>
  setSaveError: (error: string | null) => void
  setSaving: (saving: boolean) => void
  workspaceStore: ReturnType<typeof useEditorWorkspaceStoreApi>
}

function uniqueOpenPaths(
  paths: readonly string[],
  workspace: { openFilePaths: readonly string[] }
) {
  const openPaths = new Set(workspace.openFilePaths)

  return [...new Set(paths)].filter((path) => openPaths.has(path))
}
