import type { ProjectId } from '@workspace/contracts'
import { create } from 'zustand'

export type ProjectDeleteRequest = {
  readonly projectId: ProjectId
  /** Sessions the cascade will take with it, archived ones included. */
  readonly sessionCount: number
  readonly title: string
}

/**
 * The project a delete confirmation is currently asking about. Outside the rail for the
 * same reason the session request is: the header that raised the question is the first
 * thing to disappear once the answer is yes, and the dialog outlives it.
 */
type ProjectDeleteRequestStore = {
  readonly request: ProjectDeleteRequest | null
  readonly dismissDelete: () => void
  readonly requestDelete: (request: ProjectDeleteRequest) => void
}

export const useProjectDeleteRequestStore = create<ProjectDeleteRequestStore>()((set) => ({
  dismissDelete: () => set({ request: null }),
  request: null,
  requestDelete: (request) => set({ request }),
}))
