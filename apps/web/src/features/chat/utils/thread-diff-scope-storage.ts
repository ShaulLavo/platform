import { turnIdSchema, type TurnId } from '@workspace/contracts'
import * as v from 'valibot'

export const THREAD_DIFF_SCOPE_STORAGE_KEY = 'platform.chat-thread-diff-scope.v1'
const THREAD_DIFF_SCOPE_STORAGE_VERSION = 1

/**
 * Nothing deletes an entry when a thread goes away, so the map is bounded here
 * and the least recently touched picks fall off the end. Losing one costs the
 * user a pane that opens on the branch diff instead of the turn they left it on.
 */
export const THREAD_DIFF_SCOPE_LIMIT = 200

/**
 * The branch diff is deliberately not a variant. The server answers
 * `/git/branch-diff`, but nothing on the client renders it, so a scope for it
 * could only ever persist a pick the pane cannot honour.
 */
const threadDiffScopeSchema = v.variant('kind', [
  v.object({ kind: v.literal('working-tree') }),
  v.object({
    filePath: v.nullable(v.string()),
    kind: v.literal('turn'),
    turnId: turnIdSchema,
  }),
])

const persistedEntrySchema = v.object({
  scope: threadDiffScopeSchema,
  updatedAt: v.number(),
})

const persistedStorageSchema = v.object({
  scopeByThreadId: v.record(v.string(), persistedEntrySchema),
  version: v.literal(THREAD_DIFF_SCOPE_STORAGE_VERSION),
})

export type ThreadDiffScope = v.InferOutput<typeof threadDiffScopeSchema>
export type PersistedThreadDiffScopeEntry = v.InferOutput<typeof persistedEntrySchema>
export type PersistedThreadDiffScopeStorage = v.InferOutput<typeof persistedStorageSchema>

/**
 * What a thread with no remembered pick shows — the same working-tree panel the
 * git tab has always opened on, so a thread nobody has chosen for behaves the
 * way it did before it could be chosen for.
 */
export const DEFAULT_THREAD_DIFF_SCOPE: ThreadDiffScope = { kind: 'working-tree' }

function emptyPersistedThreadDiffScopes(): PersistedThreadDiffScopeStorage {
  return {
    scopeByThreadId: {},
    version: THREAD_DIFF_SCOPE_STORAGE_VERSION,
  }
}

/** Anything written by a different shape is dropped whole — a pick is a preference, not data. */
export function readPersistedThreadDiffScopes(): PersistedThreadDiffScopeStorage {
  const fallback = emptyPersistedThreadDiffScopes()
  if (typeof localStorage === 'undefined') return fallback

  try {
    const raw = localStorage.getItem(THREAD_DIFF_SCOPE_STORAGE_KEY)
    if (!raw) return fallback

    const parsed = v.safeParse(persistedStorageSchema, JSON.parse(raw))
    if (!parsed.success) return fallback

    return {
      scopeByThreadId: pruneThreadDiffScopes(parsed.output.scopeByThreadId),
      version: THREAD_DIFF_SCOPE_STORAGE_VERSION,
    }
  } catch {
    return fallback
  }
}

export function writePersistedThreadDiffScopes(
  scopeByThreadId: Readonly<Record<string, PersistedThreadDiffScopeEntry>>,
) {
  if (typeof localStorage === 'undefined') return

  localStorage.setItem(
    THREAD_DIFF_SCOPE_STORAGE_KEY,
    JSON.stringify({
      scopeByThreadId,
      version: THREAD_DIFF_SCOPE_STORAGE_VERSION,
    }),
  )
}

export function pruneThreadDiffScopes(
  scopeByThreadId: Readonly<Record<string, PersistedThreadDiffScopeEntry>>,
  limit = THREAD_DIFF_SCOPE_LIMIT,
): Record<string, PersistedThreadDiffScopeEntry> {
  const entries = Object.entries(scopeByThreadId)
  if (entries.length <= limit) return { ...scopeByThreadId }

  return Object.fromEntries(
    entries.toSorted(([, left], [, right]) => right.updatedAt - left.updatedAt).slice(0, limit),
  )
}

/**
 * Stamps are compared, never displayed, so a wall clock that stands still (or
 * steps backwards) must not make two writes indistinguishable — eviction order
 * would become arbitrary. Always beat the highest stamp already stored.
 */
export function nextThreadDiffScopeStamp(
  scopeByThreadId: Readonly<Record<string, PersistedThreadDiffScopeEntry>>,
): number {
  let highest = 0

  for (const entry of Object.values(scopeByThreadId)) {
    if (entry.updatedAt > highest) highest = entry.updatedAt
  }

  return Math.max(Date.now(), highest + 1)
}

/**
 * The reason this state is stored rather than derived: reverting to a checkpoint
 * deletes every checkpoint after it, so a remembered "turn 7" routinely names a
 * turn that no longer exists. Returns the scope to move to, or `null` when the
 * stored one still stands.
 *
 * `availableTurnIds` is the thread's own checkpoint order, oldest first — the
 * same order the projection keeps them in. A revert only ever drops a suffix, so
 * the survivors are a prefix and the last of them is the nearest turn to the one
 * that went away.
 */
export function reconcileThreadDiffScope(
  scope: ThreadDiffScope,
  availableTurnIds: readonly TurnId[],
): ThreadDiffScope | null {
  if (scope.kind !== 'turn') return null
  // Empty means "the thread detail has not arrived", not "this thread has no
  // turns": reconciling against it would throw the remembered pick away on every
  // cold start, before the subscription has had a chance to answer.
  if (availableTurnIds.length === 0) return null
  if (availableTurnIds.includes(scope.turnId)) return null

  const nearestTurnId = availableTurnIds.at(-1)
  if (!nearestTurnId) return null

  // The file is deliberately dropped rather than carried over: nothing says the
  // surviving turn touched it, and a path with no hunks renders as "no changes",
  // which reads as a broken pane instead of the reconcile it actually is.
  return { filePath: null, kind: 'turn', turnId: nearestTurnId }
}
