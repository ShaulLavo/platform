import {
  DEFAULT_PROVIDER_INSTANCE_ID,
  providerListResultSchema,
  type ProviderInstanceId,
  type ProviderListResult,
  type ProviderSnapshot,
} from '@workspace/contracts'
import * as v from 'valibot'
import { CodexProviderAdapter } from './adapters/codex'
import { ProviderStatusCache } from './status-cache'
import type { ProviderAdapter } from './types'

export class ProviderRegistry {
  private readonly adapters = new Map<ProviderInstanceId, ProviderAdapter>()
  private readonly statusCache: ProviderStatusCache

  constructor(adapters: ProviderAdapter[], statusCache = new ProviderStatusCache()) {
    this.statusCache = statusCache
    for (const adapter of adapters) {
      this.adapters.set(adapter.adapterKey as ProviderInstanceId, adapter)
    }
  }

  async listProviders(): Promise<ProviderListResult> {
    const providers = await Promise.all(
      Array.from(this.adapters.keys(), (providerInstanceId) => this.snapshot(providerInstanceId)),
    )

    return v.parse(providerListResultSchema, {
      providers: providers.toSorted(compareProviderSnapshots),
    })
  }

  adapter(providerInstanceId: ProviderInstanceId) {
    return this.adapters.get(providerInstanceId) ?? null
  }

  async snapshot(providerInstanceId: ProviderInstanceId) {
    const cached = this.statusCache.get(providerInstanceId)
    if (cached) return cached

    const adapter = this.adapter(providerInstanceId)
    if (!adapter) throw new Error(`Provider instance not found: ${providerInstanceId}`)

    const snapshot = await adapter.snapshot()
    this.statusCache.set(snapshot)

    return snapshot
  }
}

export function createDefaultProviderRegistry() {
  return new ProviderRegistry([new CodexProviderAdapter()])
}

export function compareProviderSnapshots(left: ProviderSnapshot, right: ProviderSnapshot) {
  return (
    left.displayLabel.localeCompare(right.displayLabel) ||
    left.driverKind.localeCompare(right.driverKind) ||
    left.providerInstanceId.localeCompare(right.providerInstanceId)
  )
}

export function defaultProviderInstanceId() {
  return DEFAULT_PROVIDER_INSTANCE_ID
}
