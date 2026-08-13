import { use } from 'react'
import { useStore } from 'zustand'

import {
  EditorWorkspaceStateContext,
  type EditorWorkspaceStore,
  type EditorWorkspaceStoreApi,
} from '@/features/editor/state/editor-workspace-state'

/**
 * Whether a folder is open, without requiring the workspace provider.
 *
 * The settings page renders in two places: as an editor tab, which is inside
 * `EditorStateProvider`, and as the folderless dialog, which is not. Reading the
 * store through the throwing accessor would take the folderless shell down —
 * and the folderless shell is precisely the case where the answer is "no".
 */
export function useHasWorkspace(): boolean {
  const store = use(EditorWorkspaceStateContext)

  // `useStore` runs either way, against a stub when there is no provider, so the
  // hook order stays fixed across both mounts.
  return useStore(store ?? EMPTY_STORE, (state) => state.rootFolder !== null)
}

const EMPTY_STATE = { rootFolder: null } as unknown as EditorWorkspaceStore

const EMPTY_STORE: EditorWorkspaceStoreApi = {
  getState: () => EMPTY_STATE,
  getInitialState: () => EMPTY_STATE,
  setState: () => {},
  subscribe: () => () => {},
} as unknown as EditorWorkspaceStoreApi
