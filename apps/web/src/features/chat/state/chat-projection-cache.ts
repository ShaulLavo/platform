import {
  orchestrationMessageSchema,
  orchestrationProjectShellSchema,
  orchestrationThreadActivitySchema,
  orchestrationThreadShellSchema,
  threadIdSchema,
  type OrchestrationSession,
  type OrchestrationThread,
  type OrchestrationThreadShell,
  type ThreadId,
} from '@workspace/contracts'
import * as v from 'valibot'

import {
  CHAT_PROJECTION_CACHE_ACTIVITY_LIMIT,
  CHAT_PROJECTION_CACHE_MESSAGE_LIMIT,
  CHAT_PROJECTION_CACHE_THREAD_LIMIT,
  CHAT_PROJECTION_CACHE_TRANSCRIPT_LIMIT,
} from './chat-cache-constants'
import type { ChatProjectionState, ChatSidebarThreadSummary } from './chat-projection-store'
import {
  syncChatProjectionShellSnapshot,
  syncChatProjectionThreadDetailSnapshot,
} from './chat-projection-writers'

export const CHAT_PROJECTION_CACHE_STORAGE_KEY = 'platform.chat-projection'

/**
 * Bump on any shape change. The key is deliberately stable so a bump drops the
 * one entry instead of orphaning it under an old key — greenfield, so a stale
 * shape is deleted rather than migrated.
 */
const CHAT_PROJECTION_CACHE_VERSION = 1

const cachedChatTranscriptSchema = v.object({
  activities: v.array(orchestrationThreadActivitySchema),
  messages: v.array(orchestrationMessageSchema),
  threadId: threadIdSchema,
})

const cachedChatProjectionSchema = v.object({
  projects: v.array(orchestrationProjectShellSchema),
  threads: v.array(orchestrationThreadShellSchema),
  transcripts: v.array(cachedChatTranscriptSchema),
  updatedAt: v.string(),
  version: v.literal(CHAT_PROJECTION_CACHE_VERSION),
})

export type CachedChatProjection = v.InferOutput<typeof cachedChatProjectionSchema>

/**
 * Reads the painted-before-connect snapshot. Anything that fails the version
 * gate or the schema is deleted here rather than partially applied: a half-read
 * projection is indistinguishable from server truth once it is in the store.
 */
export function readChatProjectionCache(): CachedChatProjection | null {
  if (!canUseLocalStorage()) return null

  try {
    const raw = localStorage.getItem(CHAT_PROJECTION_CACHE_STORAGE_KEY)
    if (!raw) return null

    const parsed = v.safeParse(cachedChatProjectionSchema, JSON.parse(raw))
    if (parsed.success) return parsed.output

    removeChatProjectionCache()
    return null
  } catch {
    removeChatProjectionCache()
    return null
  }
}

/**
 * Transcripts are the bulky part, so a quota failure retries shell-only before
 * giving up: losing the open conversation's head still beats a blank sidebar.
 */
export function writeChatProjectionCache(cached: CachedChatProjection) {
  if (!canUseLocalStorage()) return false
  if (setCacheEntry(cached)) return true
  if (setCacheEntry({ ...cached, transcripts: [] })) return true

  removeChatProjectionCache()
  return false
}

function removeChatProjectionCache() {
  if (!canUseLocalStorage()) return

  try {
    localStorage.removeItem(CHAT_PROJECTION_CACHE_STORAGE_KEY)
  } catch {
    // Private-mode storage failures must never keep the app from opening.
  }
}

export function chatProjectionCacheFromState(state: ChatProjectionState): CachedChatProjection {
  return {
    projects: state.projectIds.flatMap((projectId) => state.projectById[projectId] ?? []),
    threads: cachedShellThreads(state),
    transcripts: cachedTranscripts(state),
    updatedAt: state.lastAppliedShellUpdatedAt ?? new Date().toISOString(),
    version: CHAT_PROJECTION_CACHE_VERSION,
  }
}

/**
 * Replays the cached snapshot through the real writers, so a painted-from-cache
 * store is shaped exactly like a served one. Sequence cursors are deliberately
 * left at zero: the first server snapshot must outrank the cache and replace it
 * wholesale, and the detail stream must resume from the beginning rather than
 * from a cursor no live subscription ever earned.
 */
export function hydrateChatProjectionState(
  state: ChatProjectionState,
  cached: CachedChatProjection | null,
): ChatProjectionState {
  if (!cached) return state

  let nextState = syncChatProjectionShellSnapshot(state, {
    projects: cached.projects,
    snapshotSequence: 0,
    threads: cached.threads,
    updatedAt: cached.updatedAt,
  })

  for (const transcript of cached.transcripts) {
    const thread = cachedTranscriptThread(cached, transcript)
    if (!thread) continue

    nextState = syncChatProjectionThreadDetailSnapshot(nextState, {
      checkpoints: [],
      proposedPlans: [],
      snapshotSequence: 0,
      thread,
    })
  }

  return {
    ...nextState,
    bootstrapComplete: false,
    lastAppliedShellSequence: 0,
    lastAppliedShellUpdatedAt: null,
    threadDetailSequenceById: {},
    // The cache holds a short tail by design, so replaying it through the
    // snapshot writer concludes "no earlier history" for every thread. Dropped
    // rather than trusted: unknown reads as "offer the page", and the real
    // snapshot settles it moments later.
    threadHasEarlierById: {},
  }
}

function setCacheEntry(cached: CachedChatProjection) {
  try {
    localStorage.setItem(CHAT_PROJECTION_CACHE_STORAGE_KEY, JSON.stringify(cached))
    return true
  } catch {
    return false
  }
}

function cachedShellThreads(state: ChatProjectionState) {
  const threads: OrchestrationThreadShell[] = []

  for (const threadId of state.threadIds) {
    if (threads.length >= CHAT_PROJECTION_CACHE_THREAD_LIMIT) break

    const shell = state.threadShellById[threadId]
    const summary = state.sidebarThreadSummaryById[threadId]
    if (!shell || !summary) continue

    threads.push({
      ...summary,
      ...shell,
      session: cachedThreadSession(state, threadId, summary),
    })
  }

  return threads
}

/** `null` is a real session, so presence in the live slice decides, as it does in the selector. */
function cachedThreadSession(
  state: ChatProjectionState,
  threadId: ThreadId,
  summary: ChatSidebarThreadSummary,
): OrchestrationSession | null {
  if (!Object.hasOwn(state.threadSessionById, threadId)) return summary.session

  return state.threadSessionById[threadId] ?? null
}

/**
 * Only threads whose detail has actually been synced carry a transcript, which
 * is the closest the projection gets to knowing which conversation is open —
 * opening one is what retains its detail subscription. Newest first, so the
 * budget goes to the thread the user is most likely to land back on.
 */
function cachedTranscripts(state: ChatProjectionState) {
  const threadIds = Object.keys(state.threadDetailMetaById) as ThreadId[]
  const ordered = threadIds.toSorted((left, right) =>
    threadDetailUpdatedAt(state, right).localeCompare(threadDetailUpdatedAt(state, left)),
  )

  return ordered.slice(0, CHAT_PROJECTION_CACHE_TRANSCRIPT_LIMIT).map((threadId) => ({
    activities: transcriptTail(
      state.activityIdsByThreadId[threadId],
      state.activityByThreadId[threadId],
      CHAT_PROJECTION_CACHE_ACTIVITY_LIMIT,
    ),
    messages: transcriptTail(
      state.messageIdsByThreadId[threadId],
      state.messageByThreadId[threadId],
      CHAT_PROJECTION_CACHE_MESSAGE_LIMIT,
    ),
    threadId,
  }))
}

function threadDetailUpdatedAt(state: ChatProjectionState, threadId: ThreadId) {
  return (
    state.threadShellById[threadId]?.updatedAt ?? state.threadDetailMetaById[threadId].updatedAt
  )
}

function transcriptTail<TId extends string, TValue>(
  ids: readonly TId[] | undefined,
  byId: Record<TId, TValue> | undefined,
  limit: number,
): TValue[] {
  if (!ids || !byId) return []

  return ids.slice(-limit).flatMap((id) => byId[id] ?? [])
}

function cachedTranscriptThread(
  cached: CachedChatProjection,
  transcript: CachedChatProjection['transcripts'][number],
): OrchestrationThread | null {
  const shell = cached.threads.find((thread) => thread.id === transcript.threadId)
  if (!shell) return null

  return {
    activities: transcript.activities,
    archivedAt: shell.archivedAt,
    branch: shell.branch,
    createdAt: shell.createdAt,
    deletedAt: null,
    id: shell.id,
    interactionMode: shell.interactionMode,
    latestTurn: shell.latestTurn,
    messages: transcript.messages,
    modelSelection: shell.modelSelection,
    projectId: shell.projectId,
    runtimeMode: shell.runtimeMode,
    session: shell.session,
    title: shell.title,
    updatedAt: shell.updatedAt,
    worktreePath: shell.worktreePath,
  }
}

function canUseLocalStorage() {
  return typeof localStorage !== 'undefined'
}
