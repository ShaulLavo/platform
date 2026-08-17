import { useCallback } from 'react'

import { useFocus } from '@/features/workspace/providers/focus-state'
import { useTheme } from '@/components/theme-context'
import type { RequestCloseTab } from '@/features/editor/hooks/use-dirty-tab-close'
import { useEditorCommands } from '@/features/editor/state/commands'
import { useOpenFileAtRef } from '@/features/git/hooks/use-open-file-at-ref'
import { useEditorDocumentStoreApi } from '@/features/editor/state/document-state'
import { useEditorWorkspaceStoreApi } from '@/features/editor/state/workspace-state'
import {
  activeEditorPathForWorkbenchPanels,
  activeEditorTabForWorkbenchPanels,
} from '@/features/workbench/utils/panels'
import { log } from '@/lib/client-logging'
import { useQueryClient } from '@tanstack/react-query'

import type { WorkspaceCommandContext } from './define-command'
import { editorCommandIdFromPlatform } from './editor-keymap'
import { platformCommand } from './table'
import type { PlatformCommandId, WorkspaceCommandId } from './types'
import type { PlatformCommandDispatch } from './use-app-keymap'
import { DEFAULT_SETTING_VALUES } from '@workspace/contracts'
import { useSettings } from '@/features/settings/hooks/use-settings'
import { useSettingsActions } from '@/features/settings/hooks/use-settings-actions'

export function usePlatformCommandDispatch({
  requestCloseTab,
  showCommandPalette = noop,
  showSettings = noop,
}: {
  readonly requestCloseTab?: RequestCloseTab
  readonly showCommandPalette?: (initialSearch?: string) => void
  readonly showSettings?: () => void
} = {}): PlatformCommandDispatch {
  const documentStore = useEditorDocumentStoreApi()
  const queryClient = useQueryClient()
  const workspaceStore = useEditorWorkspaceStoreApi()
  const { setTheme } = useTheme()
  const settings = useSettings()
  const { setSetting } = useSettingsActions()
  const diffViewMode =
    settings.data?.values['editor.diff.viewMode'] ?? DEFAULT_SETTING_VALUES['editor.diff.viewMode']
  const wallpaperEnabled =
    settings.data?.values['workbench.wallpaper.enabled'] ??
    DEFAULT_SETTING_VALUES['workbench.wallpaper.enabled']
  const requestEditorFocus = useFocus((state) => state.requestEditorFocus)
  const dispatchEditorCommand = useFocus((state) => state.dispatchEditorCommand)
  const setFocusArea = useFocus((state) => state.setFocusArea)
  const { closeTab, openSearchEditor, reopenClosedEditor, selectPreviousEditor } =
    useEditorCommands()
  const openFileAtRef = useOpenFileAtRef()
  const fallbackRequestCloseTab = useCallback<RequestCloseTab>(
    (tabId) => {
      closeTab(tabId)
      return true
    },
    [closeTab],
  )
  const resolvedRequestCloseTab = requestCloseTab ?? fallbackRequestCloseTab

  // Stable identity, not performance: the consumer re-subscribes the document
  // keydown listener and republishes the menu dispatch on every change, so the
  // array below has to name everything the callback reads. Values sourced from
  // `workspaceStore.getState()` are read at call time and are deliberately
  // absent; the settings values are closed over and are deliberately present.
  return useCallback(
    (command: PlatformCommandId, event?: KeyboardEvent) => {
      const editorCommand = editorCommandIdFromPlatform(command)
      if (editorCommand) return dispatchEditorCommand(editorCommand, { event })
      const workspaceCommand = workspaceCommandIdFromPlatform(command)
      if (!workspaceCommand) return false

      const workspace = workspaceStore.getState()
      return dispatchWorkspaceCommand(workspaceCommand, {
        activeFilePath: activeEditorPathForWorkbenchPanels(workspace.workbenchPanels),
        activeTabId: activeEditorTabForWorkbenchPanels(workspace.workbenchPanels)?.id ?? null,
        chatModePanels: workspace.chatModePanels,
        diffViewMode,
        documentStore,
        openPicker: workspace.openPicker,
        openFileAtRef,
        openSearchEditor,
        queryClient,
        reopenClosedEditor,
        requestCloseTab: resolvedRequestCloseTab,
        requestEditorFocus,
        rootPath: workspace.rootFolder?.path ?? null,
        setChatModePanels: workspace.setChatModePanels,
        setDiffViewMode: (mode) => setSetting('editor.diff.viewMode', mode),
        setFocusArea,
        setTheme,
        setUiMode: workspace.setUiMode,
        setWallpaperEnabled: (enabled) => setSetting('workbench.wallpaper.enabled', enabled),
        setWorkbenchPanels: workspace.setWorkbenchPanels,
        showCommandPalette,
        showSettings,
        selectPreviousEditor,
        uiMode: workspace.uiMode,
        wallpaperEnabled,
        workbenchPanels: workspace.workbenchPanels,
      })
    },
    [
      diffViewMode,
      documentStore,
      dispatchEditorCommand,
      queryClient,
      openFileAtRef,
      openSearchEditor,
      reopenClosedEditor,
      requestEditorFocus,
      resolvedRequestCloseTab,
      selectPreviousEditor,
      setFocusArea,
      setSetting,
      setTheme,
      showCommandPalette,
      showSettings,
      wallpaperEnabled,
      workspaceStore,
    ],
  )
}

function dispatchWorkspaceCommand(command: WorkspaceCommandId, context: WorkspaceCommandContext) {
  const entry = platformCommand(command)
  if (!entry || entry.kind !== 'workspace') return false

  const handled = entry.run(context) ?? true

  log.info({
    action: 'workspace.command',
    area: 'command',
    command,
    handled,
  })
  return handled
}

function workspaceCommandIdFromPlatform(command: PlatformCommandId): WorkspaceCommandId | null {
  if (command.startsWith('editor.')) return null

  return command as WorkspaceCommandId
}

function noop() {}
