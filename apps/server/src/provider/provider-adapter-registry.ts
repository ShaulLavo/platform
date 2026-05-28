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

export type ProviderInstanceRoutingInfo = {
  displayLabel: string
  driverKind: ProviderAdapter['driverKind']
  enabled: boolean
  providerInstanceId: ProviderInstanceId
}

export class ProviderAdapterRegistry {
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
      this.listInstances().map((providerInstanceId) => this.snapshot(providerInstanceId)),
    )

    return v.parse(providerListResultSchema, {
      providers: providers.toSorted(compareProviderSnapshots),
    })
  }

  listInstances() {
    return Array.from(this.adapters.keys())
  }

  adapter(providerInstanceId: ProviderInstanceId) {
    return this.adapters.get(providerInstanceId) ?? null
  }

  getByInstance(providerInstanceId: ProviderInstanceId) {
    const adapter = this.adapter(providerInstanceId)
    if (!adapter) throw new Error(`Provider instance not found: ${providerInstanceId}`)

    return adapter
  }

  async getInstanceRoutingInfo(
    providerInstanceId: ProviderInstanceId,
  ): Promise<ProviderInstanceRoutingInfo> {
    const snapshot = await this.snapshot(providerInstanceId)

    return {
      displayLabel: snapshot.displayLabel,
      driverKind: snapshot.driverKind,
      enabled: snapshot.enabled,
      providerInstanceId: snapshot.providerInstanceId,
    }
  }

  async snapshot(providerInstanceId: ProviderInstanceId) {
    const cached = this.statusCache.get(providerInstanceId)
    if (cached) return cached

    const adapter = this.getByInstance(providerInstanceId)
    const snapshot = await adapter.snapshot()
    this.statusCache.set(snapshot)

    return snapshot
  }
}

export function createDefaultProviderAdapterRegistry() {
  return new ProviderAdapterRegistry([new CodexProviderAdapter()])
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
