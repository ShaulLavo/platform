import { createInternalError } from '../observability/structured-errors'

import { and, asc, eq, lt } from 'drizzle-orm'
import {
  DEFAULT_RUNTIME_MODE,
  providerDriverKindSchema,
  providerInstanceIdSchema,
  runtimeModeSchema,
  threadIdSchema,
  type ProviderDriverKind,
  type ProviderInstanceId,
  type RuntimeMode,
  type ThreadId,
} from '@workspace/contracts'
import * as v from 'valibot'
import { getDefaultPlatformDatabase } from '../db/client'
import { providerSessionRuntime, type ProviderSessionRuntimeRow } from '../db/schema'
import type { OrchestrationDatabase } from '../orchestration/event-store'
import {
  recordChatPipelineInfo,
  recordChatPipelineWarning,
} from '../orchestration/orchestration-logging'

export type ProviderRuntimeBindingStatus =
  | 'starting'
  | 'ready'
  | 'running'
  | 'waiting'
  | 'stopped'
  | 'error'

/**
 * A binding that still has a turn behind it.
 *
 * Rows are never deleted — `markStatus` writes `stopped`, it does not remove —
 * so "a row exists" means "this instance was used once", not "it is busy". Every
 * liveness question has to go through this predicate or it answers `true`
 * forever.
 */
export function isActiveBinding(binding: { status?: ProviderRuntimeBindingStatus }) {
  return binding.status === 'starting' || binding.status === 'ready' || binding.status === 'running'
}

export type ProviderRuntimeBinding = {
  adapterKey?: string
  providerDriverKind: ProviderDriverKind
  providerInstanceId?: ProviderInstanceId
  providerSessionId?: string | null
  resumeCursor?: unknown | null
  runtimeMode?: RuntimeMode
  runtimePayload?: unknown | null
  status?: ProviderRuntimeBindingStatus
  threadId: ThreadId
}

export type ProviderRuntimeBindingWithMetadata = {
  adapterKey: string
  lastSeenAt: string
  providerDriverKind: ProviderDriverKind
  providerInstanceId: ProviderInstanceId
  providerSessionId: string | null
  resumeCursor: unknown | null
  runtimeMode: RuntimeMode
  runtimePayload: unknown | null
  status: ProviderRuntimeBindingStatus
  threadId: ThreadId
}

/** How often a stream of runtime events is allowed to move `last_seen_at`. */
const LIVENESS_WRITE_THROTTLE_MS = 5_000

export class ProviderSessionDirectory {
  private readonly database: OrchestrationDatabase
  private readonly lastSeenWriteAtMs = new Map<ThreadId, number>()
  private readonly now: () => number

  constructor(
    database: OrchestrationDatabase = getDefaultPlatformDatabase(),
    options: { now?: () => number } = {},
  ) {
    this.database = database
    this.now = options.now ?? Date.now
  }

  upsert(binding: ProviderRuntimeBinding) {
    recordChatPipelineInfo('chat.pipeline.provider_session_directory.upsert.start', {
      providerDriverKind: binding.providerDriverKind,
      providerInstanceId: binding.providerInstanceId,
      runtimeMode: binding.runtimeMode,
      status: binding.status,
      threadId: binding.threadId,
    })
    const existing = this.findRow(binding.threadId)
    const now = this.now()
    this.lastSeenWriteAtMs.set(binding.threadId, now)
    const resolved = resolveBindingForWrite(binding, existing, now)

    this.database
      .insert(providerSessionRuntime)
      .values(bindingToRowValues(resolved))
      .onConflictDoUpdate({
        target: providerSessionRuntime.threadId,
        set: bindingToRowValues(resolved),
      })
      .run()

    recordChatPipelineInfo('chat.pipeline.provider_session_directory.upsert.complete', {
      providerDriverKind: resolved.providerDriverKind,
      providerInstanceId: resolved.providerInstanceId,
      providerSessionId: resolved.providerSessionId,
      runtimeMode: resolved.runtimeMode,
      status: resolved.status,
      threadId: resolved.threadId,
    })
    return resolved
  }

  getBinding(threadId: ThreadId) {
    const row = this.findRow(threadId)
    if (!row) {
      recordChatPipelineInfo('chat.pipeline.provider_session_directory.get_binding.miss', {
        threadId,
      })
      return null
    }

    const binding = rowToBinding(row)
    recordChatPipelineInfo('chat.pipeline.provider_session_directory.get_binding.hit', {
      providerDriverKind: binding.providerDriverKind,
      providerInstanceId: binding.providerInstanceId,
      providerSessionId: binding.providerSessionId,
      runtimeMode: binding.runtimeMode,
      status: binding.status,
      threadId: binding.threadId,
    })

    return binding
  }

  getProvider(threadId: ThreadId) {
    return this.getBinding(threadId)?.providerDriverKind ?? null
  }

  listThreadIds() {
    return this.database
      .select({ threadId: providerSessionRuntime.threadId })
      .from(providerSessionRuntime)
      .orderBy(asc(providerSessionRuntime.lastSeenAt), asc(providerSessionRuntime.threadId))
      .all()
      .map((row) => v.parse(threadIdSchema, row.threadId))
  }

  listBindings() {
    const bindings = this.database
      .select()
      .from(providerSessionRuntime)
      .orderBy(asc(providerSessionRuntime.lastSeenAt), asc(providerSessionRuntime.threadId))
      .all()
      .map(rowToBinding)
    recordChatPipelineInfo('chat.pipeline.provider_session_directory.list_bindings', {
      bindingCount: bindings.length,
      threadIds: bindings.map((binding) => binding.threadId),
    })

    return bindings
  }

  /**
   * Liveness without a status change: the session is doing something, whatever
   * the projection thinks it is doing. This is what makes an idle deadline safe
   * to act on — a turn that streams for forty minutes writes `running` once and
   * would otherwise look untouched since, and a subagent working in the
   * background produces runtime traffic with no status transition at all.
   *
   * Throttled per thread because the caller is the event stream: a token delta
   * must not cost a write. The deadline is minutes wide, so a stamp that lags
   * by the throttle window is exact enough for every reader there is.
   */
  /**
   * Reap candidates, filtered in SQL. Deliberately not `listBindings()`: this
   * runs on the way into every turn, and that one scans the table and puts
   * every thread id on a wide event for an answer that is almost always empty.
   */
  listIdleSince(cutoffIso: string, status: ProviderRuntimeBindingStatus) {
    return this.database
      .select()
      .from(providerSessionRuntime)
      .where(
        and(
          eq(providerSessionRuntime.status, status),
          lt(providerSessionRuntime.lastSeenAt, cutoffIso),
        ),
      )
      .orderBy(asc(providerSessionRuntime.lastSeenAt), asc(providerSessionRuntime.threadId))
      .all()
      .map(rowToBinding)
  }

  markSeen(threadId: ThreadId) {
    const now = this.now()
    const wroteAt = this.lastSeenWriteAtMs.get(threadId)
    if (wroteAt !== undefined && now - wroteAt < LIVENESS_WRITE_THROTTLE_MS) return

    this.lastSeenWriteAtMs.set(threadId, now)
    this.database
      .update(providerSessionRuntime)
      .set({ lastSeenAt: new Date(now).toISOString() })
      .where(eq(providerSessionRuntime.threadId, threadId))
      .run()
  }

  markStatus(threadId: ThreadId, status: ProviderRuntimeBindingStatus) {
    recordChatPipelineInfo('chat.pipeline.provider_session_directory.mark_status', {
      status,
      threadId,
    })
    const now = this.now()
    this.lastSeenWriteAtMs.set(threadId, now)
    this.database
      .update(providerSessionRuntime)
      .set({ lastSeenAt: new Date(now).toISOString(), status })
      .where(eq(providerSessionRuntime.threadId, threadId))
      .run()
  }

  markRunningIfActive(threadId: ThreadId) {
    const binding = this.getBinding(threadId)
    if (!binding) return
    if (binding.status === 'stopped' || binding.status === 'error') {
      recordChatPipelineWarning('chat.pipeline.provider_session_directory.mark_running_skipped', {
        status: binding.status,
        threadId,
      })
      return
    }

    this.markStatus(threadId, 'running')
  }

  private findRow(threadId: ThreadId) {
    return this.database
      .select()
      .from(providerSessionRuntime)
      .where(eq(providerSessionRuntime.threadId, threadId))
      .get()
  }
}

function resolveBindingForWrite(
  binding: ProviderRuntimeBinding,
  existing: ProviderSessionRuntimeRow | undefined,
  nowMs: number,
): ProviderRuntimeBindingWithMetadata {
  const providerChanged =
    existing !== undefined && existing.providerDriverKind !== binding.providerDriverKind
  const providerInstanceId = resolveProviderInstanceId(binding, existing, providerChanged)
  const existingRuntimePayload = parseNullableJson(existing?.runtimePayloadJson)

  return {
    adapterKey: resolveAdapterKey(binding, existing, providerChanged),
    lastSeenAt: new Date(nowMs).toISOString(),
    providerDriverKind: binding.providerDriverKind,
    providerInstanceId,
    providerSessionId: resolveProviderSessionId(binding, existing),
    resumeCursor: resolveResumeCursor(binding, existing),
    runtimeMode: binding.runtimeMode ?? existing?.runtimeMode ?? DEFAULT_RUNTIME_MODE,
    runtimePayload: mergeRuntimePayload(existingRuntimePayload, binding.runtimePayload),
    status: binding.status ?? existing?.status ?? 'running',
    threadId: binding.threadId,
  }
}

function resolveProviderInstanceId(
  binding: ProviderRuntimeBinding,
  existing: ProviderSessionRuntimeRow | undefined,
  providerChanged: boolean,
) {
  const existingProviderInstanceId = providerChanged ? undefined : existing?.providerInstanceId
  const providerInstanceId = binding.providerInstanceId ?? existingProviderInstanceId
  if (!providerInstanceId) {
    throw createInternalError(
      'providerInstanceId is required for provider session runtime bindings.',
    )
  }

  return v.parse(providerInstanceIdSchema, providerInstanceId)
}

function resolveAdapterKey(
  binding: ProviderRuntimeBinding,
  existing: ProviderSessionRuntimeRow | undefined,
  providerChanged: boolean,
) {
  if (binding.adapterKey) return binding.adapterKey
  if (providerChanged) return binding.providerDriverKind

  return existing?.adapterKey ?? binding.providerDriverKind
}

function resolveProviderSessionId(
  binding: ProviderRuntimeBinding,
  existing: ProviderSessionRuntimeRow | undefined,
) {
  if (binding.providerSessionId !== undefined) return binding.providerSessionId

  return existing?.providerSessionId ?? null
}

function resolveResumeCursor(
  binding: ProviderRuntimeBinding,
  existing: ProviderSessionRuntimeRow | undefined,
) {
  if (binding.resumeCursor !== undefined) return binding.resumeCursor

  return parseNullableJson(existing?.resumeCursorJson)
}

function rowToBinding(row: ProviderSessionRuntimeRow): ProviderRuntimeBindingWithMetadata {
  const providerDriverKind = v.parse(providerDriverKindSchema, row.providerDriverKind)

  return {
    adapterKey: row.adapterKey,
    lastSeenAt: row.lastSeenAt,
    providerDriverKind,
    providerInstanceId: v.parse(providerInstanceIdSchema, row.providerInstanceId),
    providerSessionId: row.providerSessionId,
    resumeCursor: parseNullableJson(row.resumeCursorJson),
    runtimeMode: v.parse(runtimeModeSchema, row.runtimeMode),
    runtimePayload: parseNullableJson(row.runtimePayloadJson),
    status: parseRuntimeStatus(row.status),
    threadId: v.parse(threadIdSchema, row.threadId),
  }
}

function parseRuntimeStatus(status: string): ProviderRuntimeBindingStatus {
  switch (status) {
    case 'starting':
    case 'ready':
    case 'running':
    case 'waiting':
    case 'stopped':
    case 'error':
      return status
    default:
      throw createInternalError(`Unknown provider runtime status: ${status}`)
  }
}

function mergeRuntimePayload(existing: unknown | null, next: unknown | null | undefined) {
  if (next === undefined) return existing ?? null
  if (isRecord(existing) && isRecord(next)) return { ...existing, ...next }

  return next
}

function parseNullableJson(value: string | null | undefined) {
  if (value === null || value === undefined) return null

  return JSON.parse(value) as unknown
}

function stringifyNullableJson(value: unknown | null) {
  if (value === null) return null

  return JSON.stringify(value)
}

function bindingToRowValues(binding: ProviderRuntimeBindingWithMetadata) {
  return {
    adapterKey: binding.adapterKey,
    lastSeenAt: binding.lastSeenAt,
    providerDriverKind: binding.providerDriverKind,
    providerInstanceId: binding.providerInstanceId,
    providerSessionId: binding.providerSessionId,
    resumeCursorJson: stringifyNullableJson(binding.resumeCursor),
    runtimeMode: binding.runtimeMode,
    runtimePayloadJson: stringifyNullableJson(binding.runtimePayload),
    status: binding.status,
    threadId: binding.threadId,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
