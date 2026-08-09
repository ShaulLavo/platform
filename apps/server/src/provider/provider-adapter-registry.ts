import { createInternalError } from '../observability/structured-errors'

import {
  providerListResultSchema,
  type ProviderInstanceId,
  type ProviderListResult,
  type ProviderSnapshot,
} from '@workspace/contracts'
import * as v from 'valibot'
import { ClaudeProviderAdapter } from './adapters/claude'
import { CodexProviderAdapter } from './adapters/codex'
import { ProviderStatusCache } from './status-cache'
import type { ProviderAdapter } from './types'

export type ProviderInstanceRoutingInfo = {
  displayLabel: string
  driverKind: ProviderAdapter['driverKind']
  enabled: boolean
  providerInstanceId: ProviderInstanceId
}

export type ProviderAdapterRegistryChange = {
  providerInstanceIds: ProviderInstanceId[]
  type: 'providers.changed'
}

export type ProviderAdapterRegistryChangeListener = (
  change: ProviderAdapterRegistryChange,
) => Promise<void> | void

export class ProviderAdapterRegistry {
  private readonly adapters = new Map<ProviderInstanceId, ProviderAdapter>()
  private readonly changeListeners = new Set<ProviderAdapterRegistryChangeListener>()
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

  register(adapter: ProviderAdapter) {
    this.adapters.set(adapter.adapterKey as ProviderInstanceId, adapter)
    this.emitChanges()
  }

  unregister(providerInstanceId: ProviderInstanceId) {
    const deleted = this.adapters.delete(providerInstanceId)
    if (deleted) this.emitChanges()

    return deleted
  }

  subscribeChanges(listener: ProviderAdapterRegistryChangeListener) {
    this.changeListeners.add(listener)

    return () => this.changeListeners.delete(listener)
  }

  streamChanges(): AsyncIterable<ProviderAdapterRegistryChange> {
    return providerAdapterRegistryChangeStream(this)
  }

  adapter(providerInstanceId: ProviderInstanceId) {
    return this.adapters.get(providerInstanceId) ?? null
  }

  getByInstance(providerInstanceId: ProviderInstanceId) {
    const adapter = this.adapter(providerInstanceId)
    if (!adapter) throw createInternalError(`Provider instance not found: ${providerInstanceId}`)

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

    return this.refreshSnapshot(providerInstanceId)
  }

  /**
   * Bypasses the status cache. Sign-in and sign-out change auth state directly,
   * and the cached snapshot would otherwise keep reporting the old state for the
   * rest of its TTL — i.e. a user who just signed in still sees "not signed in".
   */
  async refreshSnapshot(providerInstanceId: ProviderInstanceId) {
    const adapter = this.getByInstance(providerInstanceId)
    const snapshot = await adapter.snapshot()
    this.statusCache.set(snapshot)

    return snapshot
  }

  private emitChanges() {
    const change = {
      providerInstanceIds: this.listInstances(),
      type: 'providers.changed' as const,
    }
    for (const listener of this.changeListeners) {
      void Promise.resolve(listener(change))
    }
  }
}

/**
 * The registry keys purely on `adapter.adapterKey` and silently overwrites on
 * collision, so each adapter's key must be its own provider instance id.
 * `ClaudeProviderAdapter.adapterKey` is `DEFAULT_CLAUDE_PROVIDER_SETTINGS.providerInstanceId`;
 * copying codex's key here would delete the Codex adapter with no error.
 */
export function createDefaultProviderAdapterRegistry() {
  return new ProviderAdapterRegistry([new CodexProviderAdapter(), new ClaudeProviderAdapter()])
}

function compareProviderSnapshots(left: ProviderSnapshot, right: ProviderSnapshot) {
  return (
    left.displayLabel.localeCompare(right.displayLabel) ||
    left.driverKind.localeCompare(right.driverKind) ||
    left.providerInstanceId.localeCompare(right.providerInstanceId)
  )
}

function providerAdapterRegistryChangeStream(adapterRegistry: ProviderAdapterRegistry) {
  return {
    async *[Symbol.asyncIterator]() {
      const queue: ProviderAdapterRegistryChange[] = []
      const waiters: Array<() => void> = []
      const unsubscribe = adapterRegistry.subscribeChanges((change) => {
        queue.push(change)
        waiters.shift()?.()
      })

      try {
        for (;;) {
          const change = queue.shift()
          if (change) {
            yield change
            continue
          }

          await new Promise<void>((resolve) => {
            waiters.push(resolve)
          })
        }
      } finally {
        unsubscribe()
        waiters.splice(0)
      }
    },
  }
}
