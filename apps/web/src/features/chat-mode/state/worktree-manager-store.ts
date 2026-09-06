import type { ScopedProjectRef } from '@workspace/contracts'
import { create } from 'zustand'

type WorktreeManagerState = {
  readonly project: ScopedProjectRef | null
  readonly openManager: (project: ScopedProjectRef) => void
  readonly closeManager: () => void
}

export const useWorktreeManagerStore = create<WorktreeManagerState>((set) => ({
  project: null,
  openManager: (project) => set({ project }),
  closeManager: () => set({ project: null }),
}))
