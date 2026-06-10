import { createInternalError } from '../observability/structured-errors'

import { asc, eq } from 'drizzle-orm'
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

export class ProviderSessionDirectory {
  private readonly database: OrchestrationDatabase

  constructor(database: OrchestrationDatabase = getDefaultPlatformDatabase()) {
    this.database = database
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
    const resolved = resolveBindingForWrite(binding, existing)

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

  markStatus(threadId: ThreadId, status: ProviderRuntimeBindingStatus) {
    recordChatPipelineInfo('chat.pipeline.provider_session_directory.mark_status', {
      status,
      threadId,
    })
    this.database
      .update(providerSessionRuntime)
      .set({ lastSeenAt: new Date().toISOString(), status })
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
): ProviderRuntimeBindingWithMetadata {
  const providerChanged =
    existing !== undefined && existing.providerDriverKind !== binding.providerDriverKind
  const providerInstanceId = resolveProviderInstanceId(binding, existing, providerChanged)
  const existingRuntimePayload = parseNullableJson(existing?.runtimePayloadJson)

  return {
    adapterKey: resolveAdapterKey(binding, existing, providerChanged),
    lastSeenAt: new Date().toISOString(),
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
