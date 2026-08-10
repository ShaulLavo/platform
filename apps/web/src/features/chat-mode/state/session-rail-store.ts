import type { ProjectId, ThreadId } from '@workspace/contracts'
import { create } from 'zustand'

import type {
  SessionRailScope,
  SessionRailView,
} from '@/features/chat-mode/utils/session-rail-model'

/** Rename happens in two places, and only the one that was asked may swap for a field. */
export type SessionRenameSurface = 'header' | 'rail'

export type SessionRenameTarget = {
  readonly surface: SessionRenameSurface
  readonly threadId: ThreadId
}

const NO_PROJECT_IDS: readonly ProjectId[] = []

/**
 * How the session list is currently being looked at: which projects, which text, the
 * inbox or the archive, which projects are folded shut, and which row has swapped its
 * title for a rename field.
 *
 * A store rather than rail-local state because the keyboard commands act on exactly
 * the list the user can see, and they run from the app keymap — several layers above
 * chat mode, with no React context of the rail's to read.
 */
type SessionRailStore = {
  readonly collapsedProjectIds: readonly ProjectId[]
  readonly query: string
  readonly renaming: SessionRenameTarget | null
  readonly scope: SessionRailScope
  readonly view: SessionRailView
  readonly endRename: () => void
  readonly setQuery: (query: string) => void
  readonly setScope: (scope: SessionRailScope) => void
  readonly setView: (view: SessionRailView) => void
  readonly startRename: (target: SessionRenameTarget) => void
  readonly toggleProjectCollapsed: (projectId: ProjectId) => void
}

export const useSessionRailStore = create<SessionRailStore>()((set) => ({
  collapsedProjectIds: NO_PROJECT_IDS,
  endRename: () => set({ renaming: null }),
  query: '',
  renaming: null,
  scope: null,
  setQuery: (query) => set({ query }),
  setScope: (scope) => set({ scope }),
  setView: (view) => set({ view }),
  startRename: (renaming) => set({ renaming }),
  toggleProjectCollapsed: (projectId) =>
    set((state) => ({
      collapsedProjectIds: toggledProjectIds(state.collapsedProjectIds, projectId),
    })),
  view: 'active',
}))

function toggledProjectIds(projectIds: readonly ProjectId[], projectId: ProjectId) {
  if (!projectIds.includes(projectId)) return [...projectIds, projectId]

  return projectIds.filter((candidate) => candidate !== projectId)
}
