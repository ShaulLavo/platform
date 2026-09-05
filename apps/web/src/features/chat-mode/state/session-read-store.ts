import { scopedSessionKey, type ScopedSessionRef } from '@workspace/contracts'
import { Debouncer } from '@tanstack/react-pacer/debouncer'
import { create } from 'zustand'

import {
  readPersistedSessionReads,
  writePersistedSessionReads,
} from '@/features/chat-mode/utils/session-read-storage'
import type { SessionSeenStamps } from '@/features/chat-mode/utils/session-unread'

const SESSION_READ_PERSIST_DEBOUNCE_MS = 300

/**
 * Which sessions the user has already seen finish. Purely client-side: "have I read
 * this" is a property of this browser, not of the session, and the server has no
 * opinion to sync.
 *
 * Writes are debounced and flushed on unload, the same shape the chat draft store
 * uses — a stamp lost to a crash costs one spurious unread dot, and that is not worth
 * a localStorage write per turn completion across every open session.
 */
type SessionReadStore = {
  readonly seenBySessionKey: SessionSeenStamps
  /** `completedAt` is the turn stamp that was read, never the local clock. */
  readonly markSeen: (ref: ScopedSessionRef, completedAt: string) => void
}

const readPersist = new Debouncer(() => flushSessionReadStorage(), {
  wait: SESSION_READ_PERSIST_DEBOUNCE_MS,
})

export const useSessionReadStore = create<SessionReadStore>()((set, get) => ({
  markSeen: (ref, completedAt) => {
    const sessionId = scopedSessionKey(ref)
    if (get().seenBySessionKey[sessionId] === completedAt) return

    set((state) => ({
      seenBySessionKey: { ...state.seenBySessionKey, [sessionId]: completedAt },
    }))
    readPersist.maybeExecute()
  },
  seenBySessionKey: readPersistedSessionReads(),
}))

function flushSessionReadStorage() {
  readPersist.cancel()
  writePersistedSessionReads(useSessionReadStore.getState().seenBySessionKey)
}

export function resetSessionReadStore() {
  readPersist.cancel()
  useSessionReadStore.setState({ seenBySessionKey: {} })
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('beforeunload', () => {
    flushSessionReadStorage()
  })
}
