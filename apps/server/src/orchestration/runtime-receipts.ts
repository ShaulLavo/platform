import type {
  ProviderDriverKind,
  ProviderInstanceId,
  RuntimeMode,
  ThreadId,
} from '@workspace/contracts'
import { getDefaultPlatformDatabase } from '../db/client'
import {
  ProviderSessionDirectory,
  type ProviderRuntimeBindingStatus,
} from '../provider/provider-session-directory'
import type { OrchestrationDatabase } from './event-store'

export class ProviderRuntimeReceipts {
  private readonly directory: ProviderSessionDirectory

  constructor(database: OrchestrationDatabase = getDefaultPlatformDatabase()) {
    this.directory = new ProviderSessionDirectory(database)
  }

  find(threadId: ThreadId) {
    return this.directory.getBinding(threadId)
  }

  upsert(input: {
    adapterKey: string
    providerDriverKind: ProviderDriverKind
    providerInstanceId: ProviderInstanceId
    providerSessionId?: string | null
    runtimeMode: RuntimeMode
    runtimePayload?: unknown
    status: ProviderRuntimeBindingStatus
    threadId: ThreadId
  }) {
    return this.directory.upsert(input)
  }

  markStatus(threadId: ThreadId, status: ProviderRuntimeBindingStatus) {
    this.directory.markStatus(threadId, status)
  }

  markRunningIfActive(threadId: ThreadId) {
    this.directory.markRunningIfActive(threadId)
  }
}
