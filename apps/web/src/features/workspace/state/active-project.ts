import { create } from 'zustand'

/**
 * Which project the app is pointed at, by workspace root.
 *
 * Chat and the editor move at different speeds: picking a session should show that
 * conversation on the next frame, while opening its folder in the editor has to stat
 * the path first. Both read this store, so they agree on the destination even while
 * the editor is still catching up — and a slow earlier open can tell it lost by
 * checking whether its own root is still the active one.
 *
 * Null means "wherever the editor is": on a cold start nothing has been activated yet.
 */
type ActiveProjectStore = {
  readonly workspaceRoot: string | null
  readonly activate: (workspaceRoot: string | null) => void
}

export const useActiveProjectStore = create<ActiveProjectStore>()((set) => ({
  workspaceRoot: null,
  activate: (workspaceRoot) => set({ workspaceRoot }),
}))

export function activateWorkspaceRoot(workspaceRoot: string | null) {
  useActiveProjectStore.getState().activate(workspaceRoot)
}

/** False once a later activation has superseded this one. */
export function isActiveWorkspaceRoot(workspaceRoot: string) {
  return useActiveProjectStore.getState().workspaceRoot === workspaceRoot
}
