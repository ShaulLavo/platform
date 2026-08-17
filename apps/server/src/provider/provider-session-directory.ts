import { createInternalError } from '../observability/structured-errors'

import { and, asc, eq, lt } from 'drizzle-orm'
import {
  DEFAULT_RUNTIME_MODE,
  providerDriverKindSchema,
  orchestrationSessionStatusSchema,
  providerInstanceIdSchema,
  runtimeModeSchema,
  threadIdSchema,
  type ProviderDriverKind,
  type OrchestrationSessionStatus,
  type ProviderInstanceId,
  type RuntimeMode,
  type ThreadId,
} from '@workspace/contracts'
import * as v from 'valibot'
import { getDefaultPlatformDatabase } from '../db/client'
import { providerSessionRuntime, type ProviderSessionRuntimeRow } from '../db/schema'
import type { OrchestrationDatabase } from '../orchestration/event-store'
import {
  providerSessionRuntimePayloadSchema,
  type ProviderSessionRuntimePayload,
} from './session-payload'
import {
  recordChatPipelineInfo,
  recordChatPipelineWarning,
} from '../orchestration/orchestration-logging'

/**
 * A binding that may still have a process behind it.
 *
 * Rows are never deleted — `markStatus` writes `stopped`, it does not remove —
 * so "a row exists" means "this instance was used once", not "it is busy". Every
 * liveness question has to go through this predicate or it answers `true`
 * forever.
 *
 * Stated as the dead set rather than the live set on purpose. The previous
 * allowlist silently excluded `waiting`, so a session parked on an approval
 * stopped being reusable, vanished from `listSessions`, and — the real cost —
 * was never torn down when its thread was repointed at another provider
 * instance, leaking the child process. A status nobody classified must default
 * to "there may be a process here": `ensureSession` re-checks with
 * `adapter.hasSession`, so a false positive costs one probe, while a false
 * negative leaks a CLI child.
 */
export function isActiveBinding(binding: { status?: OrchestrationSessionStatus }) {
  if (!binding.status) return false
  if (binding.status === 'idle') return false
  if (binding.status === 'stopped') return false
  if (binding.status === 'error') return false

  return true
}

export type ProviderRuntimeBinding = {
  adapterKey?: string
  providerDriverKind: ProviderDriverKind
  providerInstanceId?: ProviderInstanceId
  providerSessionId?: string | null
  resumeCursor?: unknown | null
  runtimeMode?: RuntimeMode
  runtimePayload?: ProviderSessionRuntimePayload | null
  status?: OrchestrationSessionStatus
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
  runtimePayload: ProviderSessionRuntimePayload | null
  status: OrchestrationSessionStatus
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
  listIdleSince(cutoffIso: string, status: OrchestrationSessionStatus) {
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

  markStatus(threadId: ThreadId, status: OrchestrationSessionStatus) {
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
  const existingRuntimePayload = parseRuntimePayload(existing?.runtimePayloadJson, binding.threadId)

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
    runtimePayload: parseRuntimePayload(row.runtimePayloadJson, row.threadId),
    status: v.parse(orchestrationSessionStatusSchema, row.status),
    threadId: v.parse(threadIdSchema, row.threadId),
  }
}

function mergeRuntimePayload(
  existing: ProviderSessionRuntimePayload | null,
  next: ProviderSessionRuntimePayload | null | undefined,
): ProviderSessionRuntimePayload | null {
  if (next === undefined) return existing
  if (next === null) return null
  if (!existing) return next

  return { ...existing, ...next }
}

/**
 * The one place the payload is validated. A row that fails the schema is a row
 * our own writer could not have produced — a stale developer database, or a
 * hand-edited one. It degrades to "no payload", which is what every reader
 * already handles, and it says so loudly rather than making the next session
 * reuse fail for no visible reason. (Syntactically broken JSON still throws out
 * of `parseNullableJson`, exactly as it did before.)
 */
function parseRuntimePayload(
  value: string | null | undefined,
  threadId: string,
): ProviderSessionRuntimePayload | null {
  const parsed = parseNullableJson(value)
  if (parsed === null) return null

  const result = v.safeParse(providerSessionRuntimePayloadSchema, parsed)
  if (result.success) return result.output

  recordChatPipelineWarning('chat.pipeline.provider_session_directory.runtime_payload.invalid', {
    issues: result.issues.map((issue) => issue.message),
    threadId,
  })

  return null
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
