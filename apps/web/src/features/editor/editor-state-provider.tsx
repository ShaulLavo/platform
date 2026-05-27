import {
  createEditorConflictStore,
  EditorConflictStateContext,
} from '@/features/editor/state/editor-conflict-state'
import {
  createEditorDocumentStore,
  EditorDocumentStateContext,
} from '@/features/editor/state/editor-document-state'
import { createEditorUiStore, EditorUiStateContext } from '@/features/editor/state/editor-ui-state'
import {
  createEditorWorkspaceStore,
  EditorWorkspaceStateContext,
} from '@/features/editor/state/editor-workspace-state'
import {
  createSearchBufferStore,
  SearchBufferStateContext,
} from '@/features/search/search-buffer-state'
import { readWorkspaceCache } from '@/lib/workspace-cache'
import { useState, type ReactNode } from 'react'

export function EditorStateProvider({ children }: { children: ReactNode }) {
  const [workspaceCache] = useState(readWorkspaceCache)
  const [conflictStore] = useState(createEditorConflictStore)
  const [documentStore] = useState(createEditorDocumentStore)
  const [searchBufferStore] = useState(() => createSearchBufferStore(workspaceCache.searchBuffer))
  const [uiStore] = useState(createEditorUiStore)
  const [workspaceStore] = useState(() => createEditorWorkspaceStore(workspaceCache))

  return (
    <EditorWorkspaceStateContext value={workspaceStore}>
      <EditorConflictStateContext value={conflictStore}>
        <EditorDocumentStateContext value={documentStore}>
          <SearchBufferStateContext value={searchBufferStore}>
            <EditorUiStateContext value={uiStore}>
              {children}
            </EditorUiStateContext>
          </SearchBufferStateContext>
        </EditorDocumentStateContext>
      </EditorConflictStateContext>
    </EditorWorkspaceStateContext>
  )
}
