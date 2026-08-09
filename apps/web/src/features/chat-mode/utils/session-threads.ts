import type { ThreadId } from '@workspace/contracts'

import type { ChatSidebarThreadSummary } from '@/features/chat/state/chat-projection-store'

/**
 * Every thread the projection holds, archived ones included. The shared sidebar
 * selector strips archived threads on the way out — correct for surfaces that pick a
 * session to show, wrong for the archive browser, which exists precisely to list what
 * was filed away. Callers subscribe to `threadIds` and `sidebarThreadSummaryById`
 * separately so the collected array is built during render, not inside a selector.
 */
export function sessionThreads(
  threadIds: readonly ThreadId[],
  summaryById: Readonly<Partial<Record<ThreadId, ChatSidebarThreadSummary>>>,
): ChatSidebarThreadSummary[] {
  return threadIds.flatMap((threadId) => summaryById[threadId] ?? [])
}
