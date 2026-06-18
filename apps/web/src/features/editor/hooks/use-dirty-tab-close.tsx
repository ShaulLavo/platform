import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { UnsavedChangesDialog } from '@/features/editor/components/unsaved-changes-dialog'
import {
  fileBackedEditorPath,
  isDirtyLiveEditorDocument,
  saveEditorDocumentByPath,
} from '@/features/editor/editor-save'
import { useEditorCommands } from '@/features/editor/state/editor-commands'
import { useEditorDocumentStoreApi } from '@/features/editor/state/editor-document-state'
import { useEditorWorkspaceStoreApi } from '@/features/editor/state/editor-workspace-state'
import {
  editorPathCountsForWorkbenchPanels,
  editorTabRecordsForWorkbenchPanels,
  type WorkbenchPanels,
} from '@/features/workbench/utils/workbench-panels'
import { errorMessage } from '@/lib/file-server'

export type RequestCloseTab = (tabId: string) => boolean
export type RequestCloseTabs = (tabIds: readonly string[]) => boolean

type PendingClose = {
  path: string
  tabIds: readonly string[]
}

const EMPTY_PENDING_CLOSES: readonly PendingClose[] = []

export function useDirtyTabCloseRequest() {
  const documentStore = useEditorDocumentStoreApi()
  const workspaceStore = useEditorWorkspaceStoreApi()
  const queryClient = useQueryClient()
  const { closeTab, discardAndCloseTab } = useEditorCommands()
  const [pendingCloses, setPendingCloses] = useState<readonly PendingClose[]>([])
  const pendingClose = pendingCloses[0] ?? null
  const pendingPath = pendingClose?.path ?? null
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const canSavePendingPath = fileBackedEditorPath(pendingPath) !== null

  const clearPendingClose = useCallback(() => {
    setPendingCloses(emptyPendingCloses)
    setSaveError(null)
  }, [])

  const advancePendingClose = useCallback(() => {
    setPendingCloses((closes) =>
      closes.length <= 1 ? emptyPendingCloses(closes) : closes.slice(1),
    )
    setSaveError(null)
  }, [])

  const requestCloseTabs = useCallback<RequestCloseTabs>(
    (tabIds) => {
      if (pendingCloses.length > 0) return false

      const workspace = workspaceStore.getState()
      const openTabs = openTabCloseTargets(tabIds, workspace.workbenchPanels)
      if (openTabs.length === 0) return false
      const state = documentStore.getState()
      const pending: PendingClose[] = []
      const closingPathCounts = tabClosePathCounts(openTabs)
      const openPathCounts = editorPathCountsForWorkbenchPanels(workspace.workbenchPanels)

      for (const tab of openTabs) {
        const dirty = isDirtyLiveEditorDocument(state, tab.path)
        const closingLastPathTab = closingPathCounts.get(tab.path) === openPathCounts.get(tab.path)
        if (dirty && closingLastPathTab) {
          appendPendingClose(pending, tab.path, tab.id)
          continue
        }

        closeTab(tab.id)
      }

      setPendingCloses((current) => pendingClosesForRequest(current, pending))
      setSaveError(null)

      return pending.length === 0
    },
    [closeTab, documentStore, pendingCloses.length, workspaceStore],
  )

  const requestCloseTab = useCallback<RequestCloseTab>(
    (tabId) => requestCloseTabs([tabId]),
    [requestCloseTabs],
  )

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) return
      if (saving) return

      clearPendingClose()
    },
    [clearPendingClose, saving],
  )

  const handleCancel = useCallback(() => {
    if (saving) return

    clearPendingClose()
  }, [clearPendingClose, saving])

  const handleDiscard = useCallback(() => {
    if (!pendingClose) return
    if (saving) return
    if (!pendingCloseIsOpen(pendingClose, workspaceStore.getState())) {
      advancePendingClose()
      return
    }

    for (const tabId of pendingClose.tabIds) {
      discardAndCloseTab(tabId)
    }
    advancePendingClose()
  }, [advancePendingClose, discardAndCloseTab, pendingClose, saving, workspaceStore])

  const handleSave = useCallback(() => {
    if (!pendingClose) return
    if (saving) return

    void saveAndClosePendingTab(pendingClose, {
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
    pendingClose,
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

function emptyPendingCloses(current: readonly PendingClose[]) {
  if (current.length === 0) return current

  return EMPTY_PENDING_CLOSES
}

function pendingClosesForRequest(
  current: readonly PendingClose[],
  pending: readonly PendingClose[],
) {
  if (pending.length > 0) return pending

  return emptyPendingCloses(current)
}

async function saveAndClosePendingTab(pendingClose: PendingClose, context: SaveAndCloseContext) {
  context.setSaving(true)
  context.setSaveError(null)

  try {
    if (!pendingCloseIsOpen(pendingClose, context.workspaceStore.getState())) {
      context.advancePendingClose()
      return
    }

    const saved = await saveEditorDocumentByPath(
      context.documentStore,
      context.queryClient,
      pendingClose.path,
    )
    if (!saved) {
      context.setSaveError('This tab could not be saved.')
      return
    }

    for (const tabId of pendingClose.tabIds) {
      context.closeTab(tabId)
    }
    context.advancePendingClose()
  } catch (error: unknown) {
    context.setSaveError(errorMessage(error))
  } finally {
    context.setSaving(false)
  }
}

type SaveAndCloseContext = {
  advancePendingClose: () => void
  closeTab: (tabId: string) => void
  documentStore: ReturnType<typeof useEditorDocumentStoreApi>
  queryClient: ReturnType<typeof useQueryClient>
  setSaveError: (error: string | null) => void
  setSaving: (saving: boolean) => void
  workspaceStore: ReturnType<typeof useEditorWorkspaceStoreApi>
}

function openTabCloseTargets(tabIds: readonly string[], workbenchPanels: WorkbenchPanels) {
  const seen = new Set<string>()
  const tabs: Array<{ id: string; path: string }> = []
  const tabsById = new Map(
    editorTabRecordsForWorkbenchPanels(workbenchPanels).map((tab) => [tab.id, tab]),
  )

  for (const tabId of tabIds) {
    if (seen.has(tabId)) continue
    seen.add(tabId)
    const tab = tabsById.get(tabId)
    if (!tab) continue
    tabs.push(tab)
  }

  return tabs
}

function tabClosePathCounts(tabs: readonly { path: string }[]) {
  const counts = new Map<string, number>()
  for (const tab of tabs) {
    counts.set(tab.path, (counts.get(tab.path) ?? 0) + 1)
  }

  return counts
}

function appendPendingClose(pending: PendingClose[], path: string, tabId: string) {
  const current = pending.find((close) => close.path === path)
  if (!current) {
    pending.push({ path, tabIds: [tabId] })
    return
  }

  pending.splice(pending.indexOf(current), 1, {
    path,
    tabIds: current.tabIds.concat(tabId),
  })
}

function pendingCloseIsOpen(
  pendingClose: PendingClose,
  workspace: { workbenchPanels: WorkbenchPanels },
) {
  const openTabIds = new Set(
    editorTabRecordsForWorkbenchPanels(workspace.workbenchPanels).map((tab) => tab.id),
  )
  return pendingClose.tabIds.some((tabId) => openTabIds.has(tabId))
}
