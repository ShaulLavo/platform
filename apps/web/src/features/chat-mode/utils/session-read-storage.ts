import { threadIdSchema, type ThreadId } from '@workspace/contracts'
import * as v from 'valibot'

import type { SessionSeenStamps } from '@/features/chat-mode/utils/session-unread'

const SESSION_READ_STORAGE_KEY = 'platform.chat-session-reads.v1'
const SESSION_READ_STORAGE_VERSION = 1
/**
 * Nothing prunes stamps for threads that were deleted elsewhere, so the record is
 * bounded here instead. Newest completions win: the oldest stamps belong to sessions
 * nobody has touched in weeks, and losing one only makes that row read as unread once.
 */
const MAX_SESSION_READ_ENTRIES = 300

const persistedSessionReadsSchema = v.object({
  seenByThreadId: v.record(threadIdSchema, v.string()),
  version: v.literal(SESSION_READ_STORAGE_VERSION),
})

export function readPersistedSessionReads(): SessionSeenStamps {
  if (!canUseLocalStorage()) return {}

  try {
    const raw = localStorage.getItem(SESSION_READ_STORAGE_KEY)
    if (!raw) return {}

    const parsed = v.safeParse(persistedSessionReadsSchema, JSON.parse(raw))
    if (!parsed.success) return {}

    return parsed.output.seenByThreadId
  } catch {
    return {}
  }
}

export function writePersistedSessionReads(seenByThreadId: SessionSeenStamps) {
  if (!canUseLocalStorage()) return

  localStorage.setItem(
    SESSION_READ_STORAGE_KEY,
    JSON.stringify({
      seenByThreadId: prunedSessionReads(seenByThreadId),
      version: SESSION_READ_STORAGE_VERSION,
    }),
  )
}

function prunedSessionReads(seenByThreadId: SessionSeenStamps): SessionSeenStamps {
  const entries = Object.entries(seenByThreadId).flatMap(([threadId, seenAt]) =>
    seenAt ? [[threadId, seenAt] as const] : [],
  )
  if (entries.length <= MAX_SESSION_READ_ENTRIES) return seenByThreadId

  return Object.fromEntries(
    entries
      .toSorted(([, left], [, right]) => right.localeCompare(left))
      .slice(0, MAX_SESSION_READ_ENTRIES),
  ) as Partial<Record<ThreadId, string>>
}

function canUseLocalStorage() {
  return typeof localStorage !== 'undefined'
}
