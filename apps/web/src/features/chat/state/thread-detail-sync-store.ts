import type { ThreadId } from '@workspace/contracts'
import { create } from 'zustand'

/**
 * Per-thread transport health, written by the thread detail subscription cache.
 * The global shell status only says whether *some* frame arrived; a thread whose
 * own stream died mid-turn needs its own signal so the UI can say so.
 */
export type ThreadDetailSyncStatus = 'blocked' | 'connecting' | 'idle' | 'live' | 'reconnecting'

export type ThreadDetailSyncState = {
  /** Consecutive failed attempts. Zero while live. */
  attempt: number
  error: string | null
  status: ThreadDetailSyncStatus
}

/** Shared identity so selectors for unsubscribed threads never re-render. */
export const IDLE_THREAD_DETAIL_SYNC: ThreadDetailSyncState = {
  attempt: 0,
  error: null,
  status: 'idle',
}

type ThreadDetailSyncStore = {
  clearThreadDetailSync: (threadId: ThreadId) => void
  setThreadDetailSync: (threadId: ThreadId, sync: ThreadDetailSyncState) => void
  syncByThreadId: Record<ThreadId, ThreadDetailSyncState>
}

export const useThreadDetailSyncStore = create<ThreadDetailSyncStore>((set) => ({
  clearThreadDetailSync: (threadId) =>
    set((state) => {
      if (state.syncByThreadId[threadId] === undefined) return state

      const { [threadId]: _removed, ...rest } = state.syncByThreadId

      return { syncByThreadId: rest }
    }),
  setThreadDetailSync: (threadId, sync) =>
    set((state) => {
      const current = state.syncByThreadId[threadId]
      if (isSameThreadDetailSync(current, sync)) return state

      return { syncByThreadId: { ...state.syncByThreadId, [threadId]: sync } }
    }),
  syncByThreadId: {},
}))

export function selectThreadDetailSync(
  state: Pick<ThreadDetailSyncStore, 'syncByThreadId'>,
  threadId: ThreadId | null | undefined,
): ThreadDetailSyncState {
  if (!threadId) return IDLE_THREAD_DETAIL_SYNC

  return state.syncByThreadId[threadId] ?? IDLE_THREAD_DETAIL_SYNC
}

function isSameThreadDetailSync(
  current: ThreadDetailSyncState | undefined,
  next: ThreadDetailSyncState,
) {
  if (!current) return false

  return (
    current.attempt === next.attempt &&
    current.error === next.error &&
    current.status === next.status
  )
}
