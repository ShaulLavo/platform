import type { ScopedSessionRef } from '@workspace/contracts'
import { create } from 'zustand'

export type SessionDeleteRequest = {
  /** One entry for a row, many for a bulk pick. Never empty. */
  readonly refs: readonly ScopedSessionRef[]
  /** The single session's title; ignored once the request covers several. */
  readonly title: string
}

/**
 * The sessions a delete confirmation is currently asking about. It lives outside the rail
 * because the rows that raised the question are the first thing to disappear once the
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
