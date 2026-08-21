import type { SettingsWriteTarget } from '@workspace/contracts'
import { use, useMemo } from 'react'

import { openEditorPathSurface } from '@/features/editor/state/commands'
import { EditorDocumentStateContext } from '@/features/editor/state/document-state'
import { EditorWorkspaceStateContext } from '@/features/editor/state/workspace-state'

import { settingsJsonDocumentId } from '../utils/json-document'

/**
 * Opens a layer's settings.json as an editor tab, or `null` where there is no
 * workbench to open it in.
 *
 * The same two-mount problem `useHasWorkspace` documents: the settings page
 * renders as an editor tab inside `EditorStateProvider`, and as the folderless
 * dialog outside it. `useEditorCommands` reads four stores through throwing
 * accessors, so calling it from the page would take the folderless shell down —
 * and the folderless shell is exactly the case where there is no tab to open.
 *
 * Callers hide the action when this is `null` rather than showing one that
 * cannot work.
 */
export function useOpenSettingsJson(): ((target: SettingsWriteTarget) => void) | null {
  const documentStore = use(EditorDocumentStateContext)
  const workspaceStore = use(EditorWorkspaceStateContext)

  return useMemo(() => {
    if (!documentStore || !workspaceStore) return null

    return (target: SettingsWriteTarget) =>
      openEditorPathSurface(settingsJsonDocumentId(target), workspaceStore, documentStore)
  }, [documentStore, workspaceStore])
}
