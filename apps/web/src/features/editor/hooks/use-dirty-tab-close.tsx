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

export function useDirtyTabCloseRequest() {
  const documentStore = useEditorDocumentStoreApi()
  const workspaceStore = useEditorWorkspaceStoreApi()
  const queryClient = useQueryClient()
  const { closeTab, discardAndCloseTab } = useEditorCommands()
  const [pendingPath, setPendingPath] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const canSavePendingPath = fileBackedEditorPath(pendingPath) !== null

  const clearPendingClose = useCallback(() => {
    setPendingPath(null)
    setSaveError(null)
  }, [])

  const requestCloseTab = useCallback<RequestCloseTab>(
    (path) => {
      if (!workspaceStore.getState().openFilePaths.includes(path)) return false

      const state = documentStore.getState()
      if (!isDirtyCachedEditorDocument(state, path)) {
        closeTab(path)
        return true
      }

      setPendingPath(path)
      setSaveError(null)
      return false
    },
    [closeTab, documentStore, workspaceStore]
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
      clearPendingClose()
      return
    }

    discardAndCloseTab(pendingPath)
    clearPendingClose()
  }, [
    clearPendingClose,
    discardAndCloseTab,
    pendingPath,
    saving,
    workspaceStore,
  ])

  const handleSave = useCallback(() => {
    if (!pendingPath) return
    if (saving) return

    void saveAndClosePendingTab(pendingPath, {
      clearPendingClose,
      closeTab,
      documentStore,
      queryClient,
      setSaveError,
      setSaving,
      workspaceStore,
    })
  }, [
    clearPendingClose,
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
      context.clearPendingClose()
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
    context.clearPendingClose()
  } catch (error: unknown) {
    context.setSaveError(errorMessage(error))
  } finally {
    context.setSaving(false)
  }
}

type SaveAndCloseContext = {
  clearPendingClose: () => void
  closeTab: (path: string) => void
  documentStore: ReturnType<typeof useEditorDocumentStoreApi>
  queryClient: ReturnType<typeof useQueryClient>
  setSaveError: (error: string | null) => void
  setSaving: (saving: boolean) => void
  workspaceStore: ReturnType<typeof useEditorWorkspaceStoreApi>
}
