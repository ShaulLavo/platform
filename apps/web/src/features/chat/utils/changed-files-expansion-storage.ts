import * as v from 'valibot'

export const CHAT_CHANGED_FILES_EXPANSION_STORAGE_KEY = 'platform.chat-changed-files-expansion.v1'
const CHAT_CHANGED_FILES_EXPANSION_STORAGE_VERSION = 1

/**
 * Nothing ever deletes an entry: a thread can be removed while the expansion of
 * its cards sits in localStorage forever. The map is bounded here instead — the
 * least recently touched entries fall off the end, and re-collapsing a card the
 * user has not seen in a thousand turns is not a bug worth carrying state for.
 */
export const CHAT_CHANGED_FILES_EXPANSION_LIMIT = 200

/**
 * `null` is not "collapsed": it means the user never said, which is what lets
 * the card fall back to its auto-expand heuristic instead of latching closed.
 */
const persistedExpansionSchema = v.object({
  cardExpanded: v.nullable(v.boolean()),
  directoriesExpanded: v.nullable(v.boolean()),
  updatedAt: v.number(),
})

const persistedExpansionStorageSchema = v.object({
  expansionByKey: v.record(v.string(), persistedExpansionSchema),
  version: v.literal(CHAT_CHANGED_FILES_EXPANSION_STORAGE_VERSION),
})

export type PersistedChatChangedFilesExpansion = v.InferOutput<typeof persistedExpansionSchema>
export type PersistedChatChangedFilesExpansionStorage = v.InferOutput<
  typeof persistedExpansionStorageSchema
>

export function emptyPersistedChatChangedFilesExpansion(): PersistedChatChangedFilesExpansionStorage {
  return {
    expansionByKey: {},
    version: CHAT_CHANGED_FILES_EXPANSION_STORAGE_VERSION,
  }
}

/**
 * The version gate. Anything written by a different shape is dropped whole
 * rather than repaired — expansion is a preference, not data anyone can lose.
 */
export function readPersistedChatChangedFilesExpansion(): PersistedChatChangedFilesExpansionStorage {
  const fallback = emptyPersistedChatChangedFilesExpansion()
  if (typeof localStorage === 'undefined') return fallback

  try {
    const raw = localStorage.getItem(CHAT_CHANGED_FILES_EXPANSION_STORAGE_KEY)
    if (!raw) return fallback

    const parsed = v.safeParse(persistedExpansionStorageSchema, JSON.parse(raw))
    if (!parsed.success) return fallback

    return {
      expansionByKey: pruneChatChangedFilesExpansion(parsed.output.expansionByKey),
      version: CHAT_CHANGED_FILES_EXPANSION_STORAGE_VERSION,
    }
  } catch {
    return fallback
  }
}

export function writePersistedChatChangedFilesExpansion(
  expansionByKey: Readonly<Record<string, PersistedChatChangedFilesExpansion>>,
) {
  if (typeof localStorage === 'undefined') return

  localStorage.setItem(
    CHAT_CHANGED_FILES_EXPANSION_STORAGE_KEY,
    JSON.stringify({
      expansionByKey,
      version: CHAT_CHANGED_FILES_EXPANSION_STORAGE_VERSION,
    }),
  )
}

export function pruneChatChangedFilesExpansion(
  expansionByKey: Readonly<Record<string, PersistedChatChangedFilesExpansion>>,
  limit = CHAT_CHANGED_FILES_EXPANSION_LIMIT,
): Record<string, PersistedChatChangedFilesExpansion> {
  const entries = Object.entries(expansionByKey)
  if (entries.length <= limit) return { ...expansionByKey }

  return Object.fromEntries(
    entries.toSorted(([, left], [, right]) => right.updatedAt - left.updatedAt).slice(0, limit),
  )
}

/**
 * Stamps are compared, never displayed, so a wall clock that stands still (or
 * steps backwards) must not make two writes indistinguishable — eviction order
 * would become arbitrary. Always beat the highest stamp already stored.
 */
export function nextChatChangedFilesExpansionStamp(
  expansionByKey: Readonly<Record<string, PersistedChatChangedFilesExpansion>>,
): number {
  let highest = 0

  for (const entry of Object.values(expansionByKey)) {
    if (entry.updatedAt > highest) highest = entry.updatedAt
  }

  return Math.max(Date.now(), highest + 1)
}
