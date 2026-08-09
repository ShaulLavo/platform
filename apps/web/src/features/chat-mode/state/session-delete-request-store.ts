import type { ThreadId } from '@workspace/contracts'
import { create } from 'zustand'

export type SessionDeleteRequest = {
  readonly threadId: ThreadId
  readonly title: string
}

/**
 * The session a delete confirmation is currently asking about. It lives outside the rail
 * because the row that raised the question is the first thing to disappear once the
 * answer is yes — and because the menu that asks sits several levels below the surface
 * that owns the dialog.
 */
type SessionDeleteRequestStore = {
  readonly request: SessionDeleteRequest | null
  readonly requestDelete: (request: SessionDeleteRequest) => void
  readonly dismissDelete: () => void
}

export const useSessionDeleteRequestStore = create<SessionDeleteRequestStore>()((set) => ({
  dismissDelete: () => set({ request: null }),
  request: null,
  requestDelete: (request) => set({ request }),
}))
