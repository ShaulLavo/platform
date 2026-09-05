import {
  environmentIdSchema,
  orchestrationMessageSchema,
  orchestrationProjectShellSchema,
  orchestrationSessionActivitySchema,
  orchestrationSessionShellSchema,
  orchestrationWorktreeShellSchema,
  sessionIdSchema,
  type OrchestrationSessionShell,
  type SessionId,
} from '@workspace/contracts'
import * as v from 'valibot'

import {
  CHAT_PROJECTION_CACHE_ACTIVITY_LIMIT,
  CHAT_PROJECTION_CACHE_MESSAGE_LIMIT,
  CHAT_PROJECTION_CACHE_SESSION_LIMIT,
  CHAT_PROJECTION_CACHE_TRANSCRIPT_LIMIT,
} from '@/features/chat/state/chat-cache-constants'
import {
  createInitialChatProjectionSlice,
  type ChatProjectionSlice,
  type ChatProjectionState,
  type ProjectionSession,
} from '@/features/chat/state/chat-projection-store'
import {
  syncChatProjectionShellSnapshot,
  syncChatProjectionSessionDetailSnapshot,
} from '@/features/chat/state/chat-projection-writers'

export const CHAT_PROJECTION_CACHE_STORAGE_KEY = 'platform.chat-projection'
const CHAT_PROJECTION_CACHE_VERSION = 2

const cachedTranscriptSchema = v.object({
  activities: v.array(orchestrationSessionActivitySchema),
  messages: v.array(orchestrationMessageSchema),
  sessionId: sessionIdSchema,
})
const cachedSliceSchema = v.object({
  environmentId: environmentIdSchema,
  projects: v.array(orchestrationProjectShellSchema),
  worktrees: v.array(orchestrationWorktreeShellSchema),
  sessions: v.array(orchestrationSessionShellSchema),
  transcripts: v.array(cachedTranscriptSchema),
  updatedAt: v.string(),
})
const cachedProjectionSchema = v.object({
  slices: v.array(cachedSliceSchema),
  version: v.literal(CHAT_PROJECTION_CACHE_VERSION),
})

export type CachedChatProjection = v.InferOutput<typeof cachedProjectionSchema>
type CachedSlice = v.InferOutput<typeof cachedSliceSchema>

export function readChatProjectionCache(): CachedChatProjection | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(CHAT_PROJECTION_CACHE_STORAGE_KEY)
    if (!raw) return null
    const parsed = v.safeParse(cachedProjectionSchema, JSON.parse(raw))
    if (parsed.success) return parsed.output
  } catch {
    removeChatProjectionCache()
    return null
  }
  removeChatProjectionCache()
  return null
}

export function writeChatProjectionCache(cached: CachedChatProjection) {
  if (typeof localStorage === 'undefined') return false
  if (setCacheEntry(cached)) return true
  const shellOnly = {
    ...cached,
    slices: cached.slices.map((slice) => ({ ...slice, transcripts: [] })),
  }
  if (setCacheEntry(shellOnly)) return true
  removeChatProjectionCache()
  return false
}

function setCacheEntry(cached: CachedChatProjection) {
  try {
    localStorage.setItem(CHAT_PROJECTION_CACHE_STORAGE_KEY, JSON.stringify(cached))
    return true
  } catch {
    return false
  }
}

function removeChatProjectionCache() {
  try {
    localStorage.removeItem(CHAT_PROJECTION_CACHE_STORAGE_KEY)
  } catch {
    return
  }
}

export function chatProjectionCacheFromState(state: ChatProjectionState): CachedChatProjection {
  return {
    slices: Object.entries(state.slices).map(([environmentId, slice]) => ({
      environmentId: v.parse(environmentIdSchema, environmentId),
      projects: slice.projectIds.flatMap((id) => slice.projectById[id] ?? []),
      worktrees: slice.worktreeIds.flatMap((id) => slice.worktreeById[id] ?? []),
      sessions: cachedShellSessions(slice),
      transcripts: cachedTranscripts(slice),
      updatedAt: slice.lastAppliedShellUpdatedAt ?? new Date().toISOString(),
    })),
    version: CHAT_PROJECTION_CACHE_VERSION,
  }
}

export function hydrateChatProjectionState(
  state: ChatProjectionState,
  cached: CachedChatProjection | null,
): ChatProjectionState {
  if (!cached) return state
  const slices = { ...state.slices }
  for (const cachedSlice of cached.slices)
    slices[cachedSlice.environmentId] = hydrateSlice(cachedSlice)
  return { slices }
}

function hydrateSlice(cached: CachedSlice): ChatProjectionSlice {
  let slice = syncChatProjectionShellSnapshot(createInitialChatProjectionSlice(), {
    projects: cached.projects,
    worktrees: cached.worktrees,
    sessions: cached.sessions,
    snapshotSequence: 0,
    updatedAt: cached.updatedAt,
  })
  for (const transcript of cached.transcripts) {
    const shell = cached.sessions.find((session) => session.id === transcript.sessionId)
    if (!shell) continue
    slice = syncChatProjectionSessionDetailSnapshot(slice, {
      checkpoints: [],
      proposedPlans: [],
      snapshotSequence: 0,
      session: {
        ...shell,
        activities: transcript.activities,
        messages: transcript.messages,
        deletedAt: null,
        deletion: null,
      },
    })
  }
  return {
    ...slice,
    bootstrapComplete: false,
    lastAppliedShellSequence: 0,
    lastAppliedShellUpdatedAt: null,
    sessionDetailSequenceById: {},
  }
}

function cachedShellSessions(slice: ChatProjectionSlice): OrchestrationSessionShell[] {
  return slice.sessionIds.slice(0, CHAT_PROJECTION_CACHE_SESSION_LIMIT).flatMap((id) => {
    const session = slice.sessionById[id]
    return session ? [shellFromProjection(session)] : []
  })
}

function shellFromProjection(session: ProjectionSession): OrchestrationSessionShell {
  const {
    detailSynced: _detail,
    liveTurn: _turn,
    metaSource: _source,
    runtimeKnown: _known,
    pendingSourceProposedPlan: _plan,
    ...shell
  } = session
  return shell
}

function cachedTranscripts(slice: ChatProjectionSlice): CachedSlice['transcripts'] {
  return slice.sessionIds
    .filter((id) => slice.sessionById[id]?.detailSynced)
    .toSorted((left, right) =>
      detailUpdatedAt(slice, right).localeCompare(detailUpdatedAt(slice, left)),
    )
    .slice(0, CHAT_PROJECTION_CACHE_TRANSCRIPT_LIMIT)
    .map((sessionId) => ({
      activities: transcriptTail(
        slice.activityIdsBySessionId[sessionId],
        slice.activityBySessionId[sessionId],
        CHAT_PROJECTION_CACHE_ACTIVITY_LIMIT,
      ),
      messages: transcriptTail(
        slice.messageIdsBySessionId[sessionId],
        slice.messageBySessionId[sessionId],
        CHAT_PROJECTION_CACHE_MESSAGE_LIMIT,
      ),
      sessionId,
    }))
}

function detailUpdatedAt(slice: ChatProjectionSlice, sessionId: SessionId) {
  return slice.sessionById[sessionId]?.updatedAt ?? ''
}

function transcriptTail<TId extends string, TValue>(
  ids: readonly TId[] | undefined,
  byId: Record<TId, TValue> | undefined,
  limit: number,
): TValue[] {
  if (!ids || !byId) return []
  return ids.slice(-limit).flatMap((id) => byId[id] ?? [])
}
