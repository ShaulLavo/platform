import {
  createEditorConflictStore,
  EditorConflictStateContext,
} from "@/features/editor/state/editor-conflict-state"
import {
  createEditorDocumentStore,
  EditorDocumentStateContext,
} from "@/features/editor/state/editor-document-state"
import {
  createEditorUiStore,
  EditorUiStateContext,
} from "@/features/editor/state/editor-ui-state"
import {
  createEditorWorkspaceStore,
  EditorWorkspaceStateContext,
} from "@/features/editor/state/editor-workspace-state"
import { useState, type ReactNode } from "react"

export function EditorStateProvider({ children }: { children: ReactNode }) {
  const [conflictStore] = useState(createEditorConflictStore)
  const [documentStore] = useState(createEditorDocumentStore)
  const [uiStore] = useState(createEditorUiStore)
  const [workspaceStore] = useState(createEditorWorkspaceStore)

  return (
    <EditorWorkspaceStateContext.Provider value={workspaceStore}>
      <EditorConflictStateContext.Provider value={conflictStore}>
        <EditorDocumentStateContext.Provider value={documentStore}>
          <EditorUiStateContext.Provider value={uiStore}>
            {children}
          </EditorUiStateContext.Provider>
        </EditorDocumentStateContext.Provider>
      </EditorConflictStateContext.Provider>
    </EditorWorkspaceStateContext.Provider>
  )
}
