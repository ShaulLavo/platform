import type { ThreadId } from '@workspace/contracts'
import { create } from 'zustand'

/**
 * Per-thread state of the "load earlier" walk. Separate from the projection
 * store because it is request state, not projected truth: a failed page must be
 * reportable and retryable without ever touching the transcript.
 */
export type ThreadEarlierPageState = {
  error: string | null
  pending: boolean
}

/** Shared identity so a thread that has never paged never re-renders on this. */
export const IDLE_THREAD_EARLIER_PAGE: ThreadEarlierPageState = {
  error: null,
  pending: false,
}

type ThreadEarlierPageStore = {
  clearThreadEarlierPage: (threadId: ThreadId) => void
  setThreadEarlierPage: (threadId: ThreadId, next: ThreadEarlierPageState) => void
  stateByThreadId: Record<ThreadId, ThreadEarlierPageState>
}

export const useThreadEarlierPageStore = create<ThreadEarlierPageStore>((set) => ({
  clearThreadEarlierPage: (threadId) =>
    set((state) => {
      if (state.stateByThreadId[threadId] === undefined) return state

      const { [threadId]: _removed, ...rest } = state.stateByThreadId

      return { stateByThreadId: rest }
    }),
  setThreadEarlierPage: (threadId, next) =>
    set((state) => {
      const current = state.stateByThreadId[threadId]
      if (current?.error === next.error && current?.pending === next.pending) return state

      return { stateByThreadId: { ...state.stateByThreadId, [threadId]: next } }
    }),
  stateByThreadId: {},
}))

export function selectThreadEarlierPage(
  state: Pick<ThreadEarlierPageStore, 'stateByThreadId'>,
  threadId: ThreadId | null | undefined,
): ThreadEarlierPageState {
  if (!threadId) return IDLE_THREAD_EARLIER_PAGE

  return state.stateByThreadId[threadId] ?? IDLE_THREAD_EARLIER_PAGE
}

export function resetThreadEarlierPageStore() {
  useThreadEarlierPageStore.setState({ stateByThreadId: {} })
}
