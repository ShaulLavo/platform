import type { ChatSidebarThreadSummary } from '@/features/chat/state/chat-projection-store'

type SessionOrderSource = Pick<ChatSidebarThreadSummary, 'createdAt' | 'id'>

/**
 * The one order every chat-mode surface sorts by: newest session on top, and there
 * it stays for the rest of its life.
 *
 * Activity is deliberately absent from the comparator. Sorting by last message means
 * an unrelated session finishing a turn slides the row you are aiming at out from
 * under the cursor — with several agents running at once that is not an edge case,
 * it is the normal state of the list. Status is carried by the row's dot and its
 * unread mark, never by its position.
 */
export function compareSessionsByCreation(left: SessionOrderSource, right: SessionOrderSource) {
  return (
    orderTimestampMs(right.createdAt) - orderTimestampMs(left.createdAt) ||
    left.id.localeCompare(right.id)
  )
}

/** A malformed stamp must not poison the whole ordering, so it sinks to the epoch. */
function orderTimestampMs(value: string) {
  const parsed = Date.parse(value)

  return Number.isNaN(parsed) ? 0 : parsed
}
