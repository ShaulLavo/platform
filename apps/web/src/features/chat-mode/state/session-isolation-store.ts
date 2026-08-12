import { create } from 'zustand'

/**
 * Whether the next session started here gets its own checkout.
 *
 * A one-shot intent rather than a setting: isolating a session is a choice
 * about *this* task ("go off and refactor while I keep working"), not a mode
 * the workspace stays in. It is consumed at send and reset, so the next draft
 * starts from the ordinary shared-root behaviour unless asked again.
 *
 * Kept out of the draft store deliberately — that one persists text across
 * reloads, and a stale isolation flag silently creating a worktree for a
 * message typed yesterday is a surprise nobody asked for.
 */
type SessionIsolationState = {
  isolateNextSession: boolean
}

type SessionIsolationActions = {
  /** Reads the intent and clears it in one step, so a retry cannot double-create. */
  consumeIsolation: () => boolean
  setIsolateNextSession: (isolate: boolean) => void
}

export type SessionIsolationStore = SessionIsolationState & SessionIsolationActions

export const useSessionIsolationStore = create<SessionIsolationStore>((set, get) => ({
  isolateNextSession: false,
  consumeIsolation: () => {
    const { isolateNextSession } = get()
    if (!isolateNextSession) return false

    set({ isolateNextSession: false })

    return true
  },
  setIsolateNextSession: (isolate) => set({ isolateNextSession: isolate }),
}))

export function resetSessionIsolationStore() {
  useSessionIsolationStore.setState({ isolateNextSession: false })
}
