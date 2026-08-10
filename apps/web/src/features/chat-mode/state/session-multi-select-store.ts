import type { ThreadId } from '@workspace/contracts'
import { create } from 'zustand'

import { threadIdRange, toggledThreadIds } from '@/features/chat-mode/utils/session-multi-select'

const NO_THREAD_IDS: readonly ThreadId[] = []

/**
 * The rows a bulk action would act on. Deliberately separate from the stage's own pick:
 * one session is on screen at a time, while archiving or deleting a morning's worth of
 * finished sessions is a job about many of them at once.
 *
 * Not persisted. A marked set is a sentence half-spoken — restoring one after a reload
 * would arm a destructive action the user no longer remembers making.
 */
type SessionMultiSelectStore = {
  /** Where a range-extend measures from: the last row picked without shift. */
  readonly anchorThreadId: ThreadId | null
  readonly threadIds: readonly ThreadId[]
  readonly clear: () => void
  /** `orderedThreadIds` is the rail's visible order, so a range spans what is on screen. */
  readonly extendTo: (threadId: ThreadId, orderedThreadIds: readonly ThreadId[]) => void
  readonly markOnly: (threadId: ThreadId) => void
  readonly toggle: (threadId: ThreadId) => void
}

export const useSessionMultiSelectStore = create<SessionMultiSelectStore>()((set) => ({
  anchorThreadId: null,
  clear: () => set({ anchorThreadId: null, threadIds: NO_THREAD_IDS }),
  extendTo: (threadId, orderedThreadIds) =>
    set((state) => ({
      // The anchor stays put so dragging the range back and forth keeps one end fixed.
      anchorThreadId: state.anchorThreadId ?? threadId,
      threadIds: threadIdRange(orderedThreadIds, state.anchorThreadId, threadId),
    })),
  markOnly: (threadId) => set({ anchorThreadId: threadId, threadIds: [threadId] }),
  threadIds: NO_THREAD_IDS,
  toggle: (threadId) =>
    set((state) => ({
      anchorThreadId: threadId,
      threadIds: toggledThreadIds(state.threadIds, threadId),
    })),
}))

/** True only for a real multi-pick: one marked row is just the row on the stage. */
export function isSessionBulkSelection(threadIds: readonly ThreadId[]) {
  return threadIds.length > 1
}
