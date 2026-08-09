import type { ProjectId, ThreadId } from '@workspace/contracts'
import { create } from 'zustand'

import type { SessionSelection } from '@/features/chat-mode/utils/active-session'

/**
 * Picking a session or starting one in another project swaps the workspace root, which
 * re-parents the chat surface. Selection lives outside that tree so the click that
 * triggered the swap survives it.
 *
 * `pendingWorkspaceRoot` is the root that swap is heading for — it tells a selection
 * that is merely waiting for its project apart from one left stale by the user opening
 * some other folder. `switchToken` supersedes: opening a root is asynchronous, so a
 * slower earlier request must not land after a later one and drag the workspace back.
 */
type SessionSelectionStore = {
  readonly pendingWorkspaceRoot: string | null
  readonly selection: SessionSelection
  readonly switchToken: number
  /** Returns the token identifying this switch; a later switch invalidates it. */
  readonly beginProjectSwitch: (workspaceRoot: string) => number
  readonly isCurrentSwitch: (token: number) => boolean
  readonly settleProjectSwitch: () => void
  /** The root could not be opened: stop waiting, and never leave a pick aimed at it. */
  readonly abandonProjectSwitch: (
    failedProjectId: ProjectId,
    fallbackProjectId: ProjectId | null,
  ) => void
  readonly selectSession: (projectId: ProjectId, threadId: ThreadId) => void
  readonly startDraft: (projectId: ProjectId) => void
}

export const useSessionSelectionStore = create<SessionSelectionStore>()((set, get) => ({
  pendingWorkspaceRoot: null,
  selection: { kind: 'auto' },
  switchToken: 0,
  beginProjectSwitch: (workspaceRoot) => {
    const switchToken = get().switchToken + 1
    set({ pendingWorkspaceRoot: workspaceRoot, switchToken })

    return switchToken
  },
  isCurrentSwitch: (token) => get().switchToken === token,
  settleProjectSwitch: () => set({ pendingWorkspaceRoot: null }),
  abandonProjectSwitch: (failedProjectId, fallbackProjectId) =>
    set((state) => ({
      pendingWorkspaceRoot: null,
      selection: selectionAfterFailedSwitch(state.selection, failedProjectId, fallbackProjectId),
    })),
  selectSession: (projectId, threadId) =>
    set({ selection: { kind: 'session', projectId, threadId } }),
  startDraft: (projectId) => set({ selection: { kind: 'draft', projectId } }),
}))

/**
 * A pick aimed at a project that failed to open must not decay into "show the open
 * project's newest thread" — that hands the user a live composer over an unrelated
 * conversation. A new-session request stays a new session; anything else goes neutral.
 */
function selectionAfterFailedSwitch(
  selection: SessionSelection,
  failedProjectId: ProjectId,
  fallbackProjectId: ProjectId | null,
): SessionSelection {
  if (selection.kind === 'auto') return selection
  if (selection.projectId !== failedProjectId) return selection
  if (selection.kind === 'draft' && fallbackProjectId) {
    return { kind: 'draft', projectId: fallbackProjectId }
  }

  return { kind: 'auto' }
}
