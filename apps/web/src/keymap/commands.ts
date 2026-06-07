import { useCallback } from 'react'

import { useFocus, type FocusArea } from '@/components/workspace/focus/providers/focus-state'
import { useTheme, type Theme } from '@/components/theme-context'
import type { RequestCloseTab } from '@/features/editor/hooks/use-dirty-tab-close'
import { useEditorCommands } from '@/features/editor/state/editor-commands'
import {
  useEditorDocumentStoreApi,
  type EditorDocumentStoreApi,
} from '@/features/editor/state/editor-document-state'
import {
  fileBackedEditorPath,
  saveAllEditorDocuments,
  saveSelectedEditorDocument,
} from '@/features/editor/editor-save'
import {
  createFileNavigatorSurface,
  createGitChangesSurface,
} from '@/features/tiling-surface-manager/engine/layout-builders'
import {
  BACKGROUND_ACTIVE_SURFACE_COMMAND_ID,
  CLOSE_ACTIVE_SURFACE_COMMAND_ID,
  COLLAPSE_ACTIVE_WINDOW_COMMAND_ID,
  EXPAND_ACTIVE_WINDOW_COMMAND_ID,
  MAXIMIZE_ACTIVE_WINDOW_COMMAND_ID,
  MOVE_ACTIVE_SURFACE_TO_BACKGROUND_COMMAND_ID,
  MOVE_ACTIVE_WINDOW_BOTTOM_COMMAND_ID,
  MOVE_ACTIVE_WINDOW_LEFT_COMMAND_ID,
  MOVE_ACTIVE_WINDOW_RIGHT_COMMAND_ID,
  MOVE_ACTIVE_WINDOW_TOP_COMMAND_ID,
  RESTORE_ACTIVE_WINDOW_COMMAND_ID,
  SPLIT_ACTIVE_WINDOW_BOTTOM_COMMAND_ID,
  SPLIT_ACTIVE_WINDOW_LEFT_COMMAND_ID,
  SPLIT_ACTIVE_WINDOW_RIGHT_COMMAND_ID,
  SPLIT_ACTIVE_WINDOW_TOP_COMMAND_ID,
  builtInWindowManagementCommands,
} from '@/features/tiling-surface-manager/engine/layout-command-catalog'
import { findWindowIdContainingSurface } from '@/features/tiling-surface-manager/engine/layout-normalize'
import { applyLayoutOperation } from '@/features/tiling-surface-manager/engine/layout-operations'
import { windowCommandDisabledReason } from '@/features/tiling-surface-manager/engine/layout-selectors'
import type {
  BuiltInWindowManagementCommand,
  DropEdge,
  LayoutOperation,
  Surface,
  WorkspaceLayout,
} from '@/features/tiling-surface-manager/engine/layout-types'
import { useEditorWorkspaceStoreApi } from '@/features/editor/state/editor-workspace-state'
import {
  nextEditorDiffViewMode,
  type EditorDiffViewMode,
} from '@/features/editor/utils/diff-view-mode'
import {
  activeEditorPathForWorkspaceLayout,
  activeEditorSurfaceTab,
} from '@/features/workbench/utils/editor-surface-layout'
import { reportError, toClientError } from '@/lib/client-error-taxonomy'
import { log } from '@/lib/client-logging'
import { setFileSnapshotQueryData } from '@/lib/file-snapshot-query-cache'
import { fetchFile } from '@/lib/file-server'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'

import { editorCommandIdFromPlatform, isEditorPlatformCommandId } from './editor-keymap'
import type { PlatformCommandId, WorkspaceCommandId } from './types'
import type { PlatformCommandDispatch } from './use-app-keymap'
import { windowManagementCommandIdForWorkspaceCommand } from './window-management-command-ids'

type WorkspaceCommandContext = {
  readonly activeFilePath: string | null
  readonly activeTabId: string | null
  readonly diffViewMode: EditorDiffViewMode
  readonly documentStore: EditorDocumentStoreApi
  readonly openPicker: () => void
  readonly queryClient: QueryClient
  readonly reopenClosedEditor: () => boolean
  readonly requestCloseTab: RequestCloseTab
  readonly requestEditorFocus: () => void
  readonly setDiffViewMode: (mode: EditorDiffViewMode) => void
  readonly setFocusArea: (area: FocusArea) => void
  readonly setTheme: (theme: Theme) => void
  readonly setWorkspaceLayout: (layout: WorkspaceLayout) => void
  readonly showCommandPalette: (initialSearch?: string) => void
  readonly selectPreviousEditor: () => boolean
  readonly workspaceLayout: WorkspaceLayout
}

type WorkspaceCommandHandler = (context: WorkspaceCommandContext) => boolean | void

export function usePlatformCommandDispatch({
  requestCloseTab,
  showCommandPalette = noop,
}: {
  readonly requestCloseTab?: RequestCloseTab
  readonly showCommandPalette?: (initialSearch?: string) => void
} = {}): PlatformCommandDispatch {
  const documentStore = useEditorDocumentStoreApi()
  const queryClient = useQueryClient()
  const workspaceStore = useEditorWorkspaceStoreApi()
  const { setTheme } = useTheme()
  const requestEditorFocus = useFocus((state) => state.requestEditorFocus)
  const dispatchEditorCommand = useFocus((state) => state.dispatchEditorCommand)
  const setFocusArea = useFocus((state) => state.setFocusArea)
  const { closeTab, reopenClosedEditor, selectPreviousEditor } = useEditorCommands()
  const fallbackRequestCloseTab = useCallback<RequestCloseTab>(
    (tabId) => {
      closeTab(tabId)
      return true
    },
    [closeTab],
  )
  const resolvedRequestCloseTab = requestCloseTab ?? fallbackRequestCloseTab

  return useCallback(
    (command: PlatformCommandId, event?: KeyboardEvent) => {
      const editorCommand = editorCommandIdFromPlatform(command)
      if (editorCommand) return dispatchEditorCommand(editorCommand, { event })
      const workspaceCommand = workspaceCommandIdFromPlatform(command)
      if (!workspaceCommand) return false

      const workspace = workspaceStore.getState()
      return dispatchWorkspaceCommand(workspaceCommand, {
        activeFilePath: activeEditorPathForWorkspaceLayout(workspace.workspaceLayout),
        activeTabId: activeEditorSurfaceTab(workspace.workspaceLayout)?.id ?? null,
        diffViewMode: workspace.diffViewMode,
        documentStore,
        openPicker: workspace.openPicker,
        queryClient,
        reopenClosedEditor,
        requestCloseTab: resolvedRequestCloseTab,
        requestEditorFocus,
        setDiffViewMode: workspace.setDiffViewMode,
        setFocusArea,
        setTheme,
        setWorkspaceLayout: workspace.setWorkspaceLayout,
        showCommandPalette,
        selectPreviousEditor,
        workspaceLayout: workspace.workspaceLayout,
      })
    },
    [
      documentStore,
      dispatchEditorCommand,
      queryClient,
      reopenClosedEditor,
      resolvedRequestCloseTab,
      requestEditorFocus,
      setFocusArea,
      setTheme,
      showCommandPalette,
      selectPreviousEditor,
      workspaceStore,
    ],
  )
}

function dispatchWorkspaceCommand(command: WorkspaceCommandId, context: WorkspaceCommandContext) {
  const handler = workspaceCommandHandlers[command]
  const handled = handler(context) ?? true

  log.info({
    action: 'workspace.command',
    area: 'command',
    command,
    handled,
  })
  return handled
}

const workspaceCommandHandlers: Record<WorkspaceCommandId, WorkspaceCommandHandler> = {
  'workspace.closeCurrentTab': closeActiveSurface,
  'workspace.focusEditor': ({ requestEditorFocus }) => {
    requestEditorFocus()
    return true
  },
  'workspace.focusFirstEditorGroup': ({ requestEditorFocus }) => {
    requestEditorFocus()
    return true
  },
  'workspace.focusSecondEditorGroup': ({ requestEditorFocus }) => {
    requestEditorFocus()
    return true
  },
  'workspace.focusThirdEditorGroup': ({ requestEditorFocus }) => {
    requestEditorFocus()
    return true
  },
  'workspace.focusFileTree': ({ setFocusArea, setWorkspaceLayout, workspaceLayout }) => {
    setWorkspaceLayout(layoutWithFocusedSurface(workspaceLayout, createFileNavigatorSurface()))
    setFocusArea('file-tree')
    return true
  },
  'workspace.focusGit': ({ setFocusArea, setWorkspaceLayout, workspaceLayout }) => {
    setWorkspaceLayout(layoutWithFocusedSurface(workspaceLayout, createGitChangesSurface()))
    setFocusArea('git')
    return true
  },
  'workspace.gotoSymbol': ({ activeFilePath, showCommandPalette }) => {
    if (!fileBackedEditorPath(activeFilePath)) return false

    showCommandPalette('@')
    return true
  },
  'workspace.openFilePicker': ({ openPicker }) => {
    openPicker()
    return true
  },
  'workspace.quickOpenPreviousEditor': ({ requestEditorFocus, selectPreviousEditor }) => {
    const selected = selectPreviousEditor()
    if (!selected) return false

    requestEditorFocus()
    return true
  },
  'workspace.quickOpenView': ({ showCommandPalette }) => {
    showCommandPalette('view ')
    return true
  },
  'workspace.reopenClosedEditor': ({ reopenClosedEditor }) => reopenClosedEditor(),
  'workspace.revertFile': ({ activeFilePath, documentStore, queryClient }) =>
    runFileLifecycle(activeFilePath, () =>
      revertSelectedEditorDocument(documentStore, queryClient, activeFilePath),
    ),
  'workspace.saveAllFiles': ({ documentStore, queryClient }) => {
    void saveAllEditorDocuments(documentStore, queryClient).catch(reportCommandError)
    return true
  },
  'workspace.saveFile': ({ activeFilePath, documentStore, queryClient }) =>
    runFileLifecycle(activeFilePath, () =>
      saveSelectedEditorDocument(documentStore, queryClient, activeFilePath),
    ),
  'workspace.showAllEditors': ({ showCommandPalette }) => {
    showCommandPalette('edt ')
    return true
  },
  'workspace.showCommandPalette': ({ showCommandPalette }) => {
    showCommandPalette('>')
    return true
  },
  'workspace.showQuickAccess': ({ showCommandPalette }) => {
    showCommandPalette('')
    return true
  },
  'workspace.selectColorMode': ({ showCommandPalette }) => {
    showCommandPalette('color ')
    return true
  },
  'workspace.setDarkTheme': ({ setTheme }) => {
    setTheme('dark')
    return true
  },
  'workspace.setLightTheme': ({ setTheme }) => {
    setTheme('light')
    return true
  },
  'workspace.setSystemTheme': ({ setTheme }) => {
    setTheme('system')
    return true
  },
  'workspace.splitEditor': windowCommandHandler('workspace.window.splitActiveWindowRight'),
  'workspace.toggleDiffViewMode': ({ diffViewMode, setDiffViewMode }) => {
    setDiffViewMode(nextEditorDiffViewMode(diffViewMode))
    return true
  },
  'workspace.togglePanel': ({ setFocusArea, setWorkspaceLayout, workspaceLayout }) => {
    setWorkspaceLayout(
      applyLayoutOperation(workspaceLayout, {
        target: 'terminal',
        type: 'toggleClassicBottomToolPane',
      }),
    )
    setFocusArea('terminal')
    return true
  },
  'workspace.toggleSidebarVisibility': ({ setWorkspaceLayout, workspaceLayout }) => {
    setWorkspaceLayout(layoutWithToggledSurface(workspaceLayout, createFileNavigatorSurface()))
    return true
  },
  'workspace.window.backgroundActiveSurface': windowCommandHandler(
    'workspace.window.backgroundActiveSurface',
  ),
  'workspace.window.closeActiveSurface': closeActiveSurface,
  'workspace.window.collapseActiveWindow': windowCommandHandler(
    'workspace.window.collapseActiveWindow',
  ),
  'workspace.window.expandActiveWindow': windowCommandHandler(
    'workspace.window.expandActiveWindow',
  ),
  'workspace.window.maximizeActiveWindow': windowCommandHandler(
    'workspace.window.maximizeActiveWindow',
  ),
  'workspace.window.moveActiveSurfaceToBackground': windowCommandHandler(
    'workspace.window.moveActiveSurfaceToBackground',
  ),
  'workspace.window.moveActiveWindowBottom': windowCommandHandler(
    'workspace.window.moveActiveWindowBottom',
  ),
  'workspace.window.moveActiveWindowLeft': windowCommandHandler(
    'workspace.window.moveActiveWindowLeft',
  ),
  'workspace.window.moveActiveWindowRight': windowCommandHandler(
    'workspace.window.moveActiveWindowRight',
  ),
  'workspace.window.moveActiveWindowTop': windowCommandHandler(
    'workspace.window.moveActiveWindowTop',
  ),
  'workspace.window.restoreActiveWindow': windowCommandHandler(
    'workspace.window.restoreActiveWindow',
  ),
  'workspace.window.splitActiveWindowBottom': windowCommandHandler(
    'workspace.window.splitActiveWindowBottom',
  ),
  'workspace.window.splitActiveWindowLeft': windowCommandHandler(
    'workspace.window.splitActiveWindowLeft',
  ),
  'workspace.window.splitActiveWindowRight': windowCommandHandler(
    'workspace.window.splitActiveWindowRight',
  ),
  'workspace.window.splitActiveWindowTop': windowCommandHandler(
    'workspace.window.splitActiveWindowTop',
  ),
}

function closeSelectedTab(activeTabId: string | null, requestCloseTab: RequestCloseTab) {
  if (!activeTabId) return false

  requestCloseTab(activeTabId)
  return true
}

function closeActiveSurface(context: WorkspaceCommandContext) {
  if (activeSurfaceCloseDisabledReason(context.workspaceLayout)) return false

  const activeSurface = activeSurfaceForLayout(context.workspaceLayout)
  if (!activeSurface) return false
  if (activeSurface.closePolicy.type === 'confirm-dirty-file') {
    return closeSelectedTab(context.activeTabId, context.requestCloseTab)
  }

  return applyWorkspaceLayoutOperation(context, {
    surfaceId: activeSurface.id,
    type: 'closeSurface',
  })
}

function windowCommandHandler(commandId: WorkspaceCommandId): WorkspaceCommandHandler {
  return (context) => dispatchBuiltInWindowCommand(commandId, context)
}

function dispatchBuiltInWindowCommand(
  commandId: WorkspaceCommandId,
  context: WorkspaceCommandContext,
) {
  const command = builtInWindowCommandForWorkspaceCommand(commandId)
  if (!command) return false
  if (windowCommandDisabledReason(context.workspaceLayout, command)) return false
  if (command.id === CLOSE_ACTIVE_SURFACE_COMMAND_ID) return closeActiveSurface(context)

  const operation = layoutOperationForBuiltInWindowCommand(context.workspaceLayout, command.id)
  if (!operation) return false

  return applyWorkspaceLayoutOperation(context, operation)
}

function applyWorkspaceLayoutOperation(
  context: WorkspaceCommandContext,
  operation: LayoutOperation,
) {
  context.setWorkspaceLayout(applyLayoutOperation(context.workspaceLayout, operation))
  return true
}

function builtInWindowCommandForWorkspaceCommand(commandId: WorkspaceCommandId) {
  const windowCommandId = windowManagementCommandIdForWorkspaceCommand(commandId)
  if (!windowCommandId) return null

  return builtInWindowCommandsById.get(windowCommandId) ?? null
}

function layoutOperationForBuiltInWindowCommand(
  layout: WorkspaceLayout,
  commandId: BuiltInWindowManagementCommand['id'],
): LayoutOperation | null {
  const activeWindowId = layout.activeWindowId
  const activeSurfaceId = layout.activeSurfaceId
  const splitEdge = splitWindowEdgesByCommandId[commandId]
  if (splitEdge && activeWindowId && activeSurfaceId) {
    return {
      edge: splitEdge,
      surfaceId: activeSurfaceId,
      type: 'splitWindow',
      windowId: activeWindowId,
    }
  }

  const moveEdge = moveWindowEdgesByCommandId[commandId]
  if (moveEdge && activeWindowId) {
    return {
      destination: { edge: moveEdge, kind: 'root-edge' },
      type: 'moveWindow',
      windowId: activeWindowId,
    }
  }

  if (backgroundSurfaceCommandIds.has(commandId) && activeSurfaceId) {
    return {
      destination: { kind: 'background' },
      surfaceId: activeSurfaceId,
      type: 'moveSurface',
    }
  }
  if (!activeWindowId) return null

  return activeWindowOperation(commandId, activeWindowId)
}

function activeWindowOperation(
  commandId: BuiltInWindowManagementCommand['id'],
  windowId: WorkspaceLayout['activeWindowId'],
): LayoutOperation | null {
  if (!windowId) return null
  if (commandId === MAXIMIZE_ACTIVE_WINDOW_COMMAND_ID) return { type: 'maximizeWindow', windowId }
  if (commandId === RESTORE_ACTIVE_WINDOW_COMMAND_ID) return { type: 'restoreWindow', windowId }
  if (commandId === COLLAPSE_ACTIVE_WINDOW_COMMAND_ID) return { type: 'collapseWindow', windowId }
  if (commandId === EXPAND_ACTIVE_WINDOW_COMMAND_ID) return { type: 'expandWindow', windowId }

  return null
}

function activeSurfaceForLayout(layout: WorkspaceLayout) {
  const activeSurfaceId = layout.activeSurfaceId
  if (!activeSurfaceId) return null

  return layout.surfacesById[activeSurfaceId] ?? null
}

function activeSurfaceCloseDisabledReason(layout: WorkspaceLayout) {
  const command = builtInWindowCommandsById.get(CLOSE_ACTIVE_SURFACE_COMMAND_ID)
  if (!command) return 'Close surface command is unavailable.'

  return windowCommandDisabledReason(layout, command)
}

function runFileLifecycle(activeFilePath: string | null, operation: () => Promise<boolean>) {
  if (!fileBackedEditorPath(activeFilePath)) return false

  void operation().catch(reportCommandError)
  return true
}

async function revertSelectedEditorDocument(
  documentStore: EditorDocumentStoreApi,
  queryClient: QueryClient,
  activeFilePath: string | null,
) {
  const path = fileBackedEditorPath(activeFilePath)
  if (!path) return false

  const file = await fetchFile(path, new AbortController().signal)
  setFileSnapshotQueryData(queryClient, file)
  documentStore.getState().forceReplaceLiveEditorDocument(file, path)
  return true
}

function reportCommandError(error: unknown) {
  reportError(toClientError(error))
}

function layoutWithFocusedSurface(layout: WorkspaceLayout, surface: Surface) {
  const existingSurface = surfaceForCommand(layout, surface)
  const visibleWindowId = findWindowIdContainingSurface(layout, existingSurface.id)
  if (visibleWindowId) {
    return applyLayoutOperation(layout, {
      surfaceId: existingSurface.id,
      type: 'activateSurface',
      windowId: visibleWindowId,
    })
  }
  if (layout.surfacesById[existingSurface.id]) {
    return applyLayoutOperation(layout, { surfaceId: existingSurface.id, type: 'restoreSurface' })
  }

  return applyLayoutOperation(layout, { surface: existingSurface, type: 'openSurface' })
}

function layoutWithToggledSurface(layout: WorkspaceLayout, surface: Surface) {
  const existingSurface = surfaceForCommand(layout, surface)
  const visibleWindowId = findWindowIdContainingSurface(layout, existingSurface.id)
  const visibleWindow = visibleWindowId ? layout.windowsById[visibleWindowId] : null
  if (visibleWindowId && visibleWindow?.mode === 'collapsed') {
    return applyLayoutOperation(layout, {
      type: 'expandWindow',
      windowId: visibleWindowId,
    })
  }
  if (visibleWindowId && layout.activeSurfaceId === existingSurface.id) {
    return applyLayoutOperation(layout, { type: 'collapseWindow', windowId: visibleWindowId })
  }
  if (visibleWindowId) return layoutWithFocusedSurface(layout, existingSurface)

  return layoutWithFocusedSurface(layout, existingSurface)
}

function surfaceForCommand(layout: WorkspaceLayout, surface: Surface): Surface {
  return layout.surfacesById[surface.id] ?? singletonSurfaceByType(layout, surface) ?? surface
}

function singletonSurfaceByType(layout: WorkspaceLayout, surface: Surface): Surface | null {
  if (surface.cardinality !== 'singleton') return null

  return (
    Object.values(layout.surfacesById).find((candidate) => candidate.type === surface.type) ?? null
  )
}

function workspaceCommandIdFromPlatform(command: PlatformCommandId): WorkspaceCommandId | null {
  if (isEditorPlatformCommandId(command)) return null

  return command
}

const builtInWindowCommandsById = new Map(
  builtInWindowManagementCommands().map((command) => [command.id, command]),
)

const backgroundSurfaceCommandIds = new Set<BuiltInWindowManagementCommand['id']>([
  BACKGROUND_ACTIVE_SURFACE_COMMAND_ID,
  MOVE_ACTIVE_SURFACE_TO_BACKGROUND_COMMAND_ID,
])

const splitWindowEdgesByCommandId: Readonly<Partial<Record<string, DropEdge>>> = {
  [SPLIT_ACTIVE_WINDOW_BOTTOM_COMMAND_ID]: 'bottom',
  [SPLIT_ACTIVE_WINDOW_LEFT_COMMAND_ID]: 'left',
  [SPLIT_ACTIVE_WINDOW_RIGHT_COMMAND_ID]: 'right',
  [SPLIT_ACTIVE_WINDOW_TOP_COMMAND_ID]: 'top',
}

const moveWindowEdgesByCommandId: Readonly<Partial<Record<string, DropEdge>>> = {
  [MOVE_ACTIVE_WINDOW_BOTTOM_COMMAND_ID]: 'bottom',
  [MOVE_ACTIVE_WINDOW_LEFT_COMMAND_ID]: 'left',
  [MOVE_ACTIVE_WINDOW_RIGHT_COMMAND_ID]: 'right',
  [MOVE_ACTIVE_WINDOW_TOP_COMMAND_ID]: 'top',
}

function noop() {}
