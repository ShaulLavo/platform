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
} from '@/features/search/state/buffer-state'
import { addressedWorkspaceCache } from '@/features/address/utils/cache'
import { parseAddress } from '@/features/address/utils/grammar'
import { readWorkspaceCache } from '@/lib/workspace-cache'
import { useEffect, useState, type ReactNode } from 'react'

export function EditorStateProvider({ children }: { children: ReactNode }) {
  // The address is folded in HERE, not applied later in an effect. Every store below
  // is seeded from this one value, so an address that arrived after them would have to
  // overwrite state the cache had already restored — which is how a shared link came to
  // close the recipient's tabs. One restore, from one merged value, before any store exists.
  const [workspaceCache] = useState(() =>
    addressedWorkspaceCache(readWorkspaceCache(), parseAddress(window.location.href)),
  )
  const [conflictStore] = useState(createEditorConflictStore)
  const [workspaceStore] = useState(() => createEditorWorkspaceStore(workspaceCache))
  const [documentStore] = useState(() =>
    createEditorDocumentStore({
      scrollPositionSeeds: workspaceStore.getState().scrollPositionByPath,
    }),
  )
  const [searchBufferStore] = useState(() =>
    createSearchBufferStore({
      cachedByRootPath: workspaceCache.searchBuffers,
      rootPath: workspaceCache.rootFolder?.path ?? null,
    }),
  )
  const [uiStore] = useState(createEditorUiStore)

  // A workspace switch swaps the slice synchronously, and zustand listeners fire
  // during `set` — so reseeding here lands before any view of the new workspace
  // is created.
  useEffect(
    () =>
      workspaceStore.subscribe(
        (state) => state.scrollPositionByPath,
        (scrollPositionByPath) =>
          documentStore.getState().seedEditorScrollPositions(scrollPositionByPath),
      ),
    [documentStore, workspaceStore],
  )

  return (
    <EditorWorkspaceStateContext value={workspaceStore}>
      <EditorConflictStateContext value={conflictStore}>
        <EditorDocumentStateContext value={documentStore}>
          <SearchBufferStateContext value={searchBufferStore}>
            <EditorUiStateContext value={uiStore}>{children}</EditorUiStateContext>
          </SearchBufferStateContext>
        </EditorDocumentStateContext>
      </EditorConflictStateContext>
    </EditorWorkspaceStateContext>
  )
}
