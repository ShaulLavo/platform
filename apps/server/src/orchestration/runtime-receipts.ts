import { eq } from 'drizzle-orm'
import type {
  ProviderDriverKind,
  ProviderInstanceId,
  RuntimeMode,
  ThreadId,
} from '@workspace/contracts'
import { db as defaultDb } from '../db/client'
import { providerSessionRuntime } from '../db/schema'
import type { OrchestrationDatabase } from './event-store'

export class ProviderRuntimeReceipts {
  private readonly database: OrchestrationDatabase

  constructor(database: OrchestrationDatabase = defaultDb) {
    this.database = database
  }

  find(threadId: ThreadId) {
    return this.database
      .select()
      .from(providerSessionRuntime)
      .where(eq(providerSessionRuntime.threadId, threadId))
      .get()
  }

  upsert(input: {
    adapterKey: string
    providerDriverKind: ProviderDriverKind
    providerInstanceId: ProviderInstanceId
    providerSessionId?: string | null
    runtimeMode: RuntimeMode
    runtimePayload?: unknown
    status: 'starting' | 'running' | 'stopped' | 'error'
    threadId: ThreadId
  }) {
    const lastSeenAt = new Date().toISOString()
    const runtimePayloadJson =
      input.runtimePayload === undefined ? undefined : JSON.stringify(input.runtimePayload)

    this.database
      .insert(providerSessionRuntime)
      .values({
        adapterKey: input.adapterKey,
        lastSeenAt,
        providerDriverKind: input.providerDriverKind,
        providerInstanceId: input.providerInstanceId,
        providerSessionId: input.providerSessionId ?? null,
        resumeCursorJson: null,
        runtimeMode: input.runtimeMode,
        runtimePayloadJson: runtimePayloadJson ?? null,
        status: input.status,
        threadId: input.threadId,
      })
      .onConflictDoUpdate({
        target: providerSessionRuntime.threadId,
        set: compactPatch({
          adapterKey: input.adapterKey,
          lastSeenAt,
          providerDriverKind: input.providerDriverKind,
          providerInstanceId: input.providerInstanceId,
          providerSessionId: input.providerSessionId ?? null,
          runtimeMode: input.runtimeMode,
          runtimePayloadJson,
          status: input.status,
        }),
      })
      .run()
  }

  markStatus(threadId: ThreadId, status: 'running' | 'stopped' | 'error') {
    this.database
      .update(providerSessionRuntime)
      .set({ lastSeenAt: new Date().toISOString(), status })
      .where(eq(providerSessionRuntime.threadId, threadId))
      .run()
  }

  markRunningIfActive(threadId: ThreadId) {
    const runtime = this.find(threadId)
    if (!runtime || runtime.status === 'stopped' || runtime.status === 'error') return

    this.markStatus(threadId, 'running')
  }
}

function compactPatch<T extends Record<string, unknown>>(patch: T) {
  return Object.fromEntries(
    Object.entries(patch).filter((entry) => entry[1] !== undefined),
  ) as Partial<T>
}
