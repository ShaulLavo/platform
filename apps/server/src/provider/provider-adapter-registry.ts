import { createInternalError } from '../observability/structured-errors'

import {
  providerListResultSchema,
  type ProviderDriverKind,
  type ProviderInstanceId,
  type ProviderListResult,
  type ProviderSnapshot,
} from '@workspace/contracts'
import * as v from 'valibot'
import {
  recordChatPipelineInfo,
  recordChatPipelineWarning,
} from '../orchestration/orchestration-logging'
import { ProviderCredentialWatch } from './credential-watch'
import type { AnyProviderDriver, ProviderInstanceConfig } from './driver'
import { BUILT_IN_PROVIDER_DRIVERS, DEFAULT_PROVIDER_INSTANCES } from './drivers/built-in'
import { defaultProviderStatusCacheDir, ProviderStatusCache } from './status-cache'
import type { ProviderAdapter } from './types'
import { mergeProviderInstanceConfigs } from './utils/instance-config-merge'
import { resolveProviderInstanceEnvironment } from './utils/instance-environment'

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

export type ProviderAdapterRegistryOptions = {
  /** Pre-materialized adapters, for tests and for the deterministic harness. */
  adapters?: readonly ProviderAdapter[]
  drivers?: readonly AnyProviderDriver[]
  statusCache?: ProviderStatusCache
}

type LiveProviderInstance = {
  adapter: ProviderAdapter
  config: ProviderInstanceConfig
  credentialPaths: readonly string[]
  dispose: () => Promise<void>
}

/**
 * Owns the live instance map. A *driver* says how to talk to a provider; an
 * *instance* is one account of it. Instances are created and torn down by
 * `reconcile`, so adding a second Codex account is a settings edit, not a
 * server restart, and removing one takes its child processes with it.
 */
export class ProviderAdapterRegistry {
  private readonly changeListeners = new Set<ProviderAdapterRegistryChangeListener>()
  private readonly credentialWatch = new ProviderCredentialWatch((providerInstanceIds) => {
    void this.refreshInstances(providerInstanceIds)
  })
  private readonly drivers = new Map<ProviderDriverKind, AnyProviderDriver>()
  private readonly instances = new Map<ProviderInstanceId, LiveProviderInstance>()
  private reconcileChain: Promise<void> = Promise.resolve()
  private readonly statusCache: ProviderStatusCache
  private readonly unavailable = new Map<ProviderInstanceId, ProviderSnapshot>()

  /** An array is shorthand for `{ adapters }` — the shape tests and harnesses use. */
  constructor(options: ProviderAdapterRegistryOptions | readonly ProviderAdapter[] = {}) {
    const resolved = Array.isArray(options)
      ? { adapters: options as readonly ProviderAdapter[] }
      : (options as ProviderAdapterRegistryOptions)
    this.statusCache = resolved.statusCache ?? new ProviderStatusCache()
    for (const driver of resolved.drivers ?? []) {
      this.registerDriver(driver)
    }
    for (const adapter of resolved.adapters ?? []) {
      this.adopt(adapter)
    }
  }

  registerDriver(driver: AnyProviderDriver) {
    this.drivers.set(driver.driverKind, driver)
  }

  /**
   * Diffs settings against the live map: untouched entries keep their adapter
   * (and their running sessions), changed and removed ones are disposed, new
   * ones are created. An entry naming a driver this build does not ship becomes
   * an unavailable snapshot instead of an error.
   */
  reconcile(entries: readonly ProviderInstanceConfig[]) {
    // Serialized: two settings writes landing together would otherwise
    // interleave create and dispose over the same instance map.
    const run = this.reconcileChain.then(() => this.applyReconcile(entries))
    this.reconcileChain = run.catch(() => {})

    return run
  }

  private async applyReconcile(entries: readonly ProviderInstanceConfig[]) {
    const seen = new Set<ProviderInstanceId>()
    const nextUnavailable = new Map<ProviderInstanceId, ProviderSnapshot>()
    const instanceCountByKind = new Map<ProviderDriverKind, number>()

    for (const entry of entries) {
      if (seen.has(entry.providerInstanceId)) {
        recordChatPipelineWarning('chat.pipeline.provider_registry.duplicate_instance', {
          providerInstanceId: entry.providerInstanceId,
        })
        continue
      }
      seen.add(entry.providerInstanceId)
      const count = (instanceCountByKind.get(entry.driverKind) ?? 0) + 1
      instanceCountByKind.set(entry.driverKind, count)
      const failure = await this.materialize(entry, count)
      if (failure) nextUnavailable.set(entry.providerInstanceId, failure)
    }

    for (const [providerInstanceId, instance] of this.instances) {
      if (seen.has(providerInstanceId)) continue

      this.instances.delete(providerInstanceId)
      this.statusCache.forget(providerInstanceId)
      await disposeInstance(providerInstanceId, instance)
    }

    this.unavailable.clear()
    for (const [providerInstanceId, snapshot] of nextUnavailable) {
      this.unavailable.set(providerInstanceId, snapshot)
    }
    this.reorderInstances(entries)

    recordChatPipelineInfo('chat.pipeline.provider_registry.reconcile', {
      instanceCount: this.instances.size,
      providerInstanceIds: this.listInstances(),
      unavailableCount: this.unavailable.size,
    })
    this.resetCredentialWatch()
    this.emitChanges()
  }

  async listProviders(): Promise<ProviderListResult> {
    const live = await Promise.all(
      this.listInstances().map((providerInstanceId) => this.snapshot(providerInstanceId)),
    )
    const providers = [...live, ...this.unavailable.values()]

    return v.parse(providerListResultSchema, {
      providers: providers.toSorted(compareProviderSnapshots),
    })
  }

  listInstances() {
    return Array.from(this.instances.keys())
  }

  register(adapter: ProviderAdapter) {
    this.adopt(adapter)
    this.resetCredentialWatch()
    this.emitChanges()
  }

  unregister(providerInstanceId: ProviderInstanceId) {
    const instance = this.instances.get(providerInstanceId)
    if (!instance) return false

    this.instances.delete(providerInstanceId)
    this.statusCache.forget(providerInstanceId)
    void disposeInstance(providerInstanceId, instance)
    this.resetCredentialWatch()
    this.emitChanges()

    return true
  }

  subscribeChanges(listener: ProviderAdapterRegistryChangeListener) {
    this.changeListeners.add(listener)
    // Credential watching costs file handles, so it runs only while someone is
    // listening for the resulting availability change.
    this.resetCredentialWatch()

    return () => {
      this.changeListeners.delete(listener)
      this.resetCredentialWatch()
    }
  }

  streamChanges(): AsyncIterable<ProviderAdapterRegistryChange> {
    return providerAdapterRegistryChangeStream(this)
  }

  adapter(providerInstanceId: ProviderInstanceId) {
    return this.instances.get(providerInstanceId)?.adapter ?? null
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

    const instance = this.instances.get(providerInstanceId)
    const hydrated = instance
      ? this.statusCache.hydrate(providerInstanceId, instance.config.driverKind)
      : null
    if (!hydrated) return this.refreshSnapshot(providerInstanceId)

    // A cold process renders the last known state immediately and re-probes
    // behind it, so the first `/providers` never waits on a CLI.
    void this.refreshInstances([providerInstanceId])

    return hydrated
  }

  /**
   * Bypasses the status cache. Sign-in and sign-out change auth state directly,
   * and the cached snapshot would otherwise keep reporting the old state for the
   * rest of its TTL — i.e. a user who just signed in still sees "not signed in".
   */
  async refreshSnapshot(providerInstanceId: ProviderInstanceId) {
    const adapter = this.getByInstance(providerInstanceId)
    const previous = this.statusCache.last(providerInstanceId, adapter.driverKind)
    const snapshot = withRememberedModels(await adapter.snapshot(), previous)
    this.statusCache.set(snapshot)

    return snapshot
  }

  /** Releases every instance. Nothing the registry spawned may outlive this. */
  async dispose() {
    this.credentialWatch.stop()
    this.changeListeners.clear()
    const instances = Array.from(this.instances.entries())
    this.instances.clear()
    for (const [providerInstanceId, instance] of instances) {
      await disposeInstance(providerInstanceId, instance)
    }
    recordChatPipelineInfo('chat.pipeline.provider_registry.disposed', {
      instanceCount: instances.length,
    })
  }

  private adopt(adapter: ProviderAdapter) {
    const providerInstanceId = adapter.adapterKey as ProviderInstanceId
    this.instances.set(providerInstanceId, {
      adapter,
      config: { driverKind: adapter.driverKind, providerInstanceId },
      credentialPaths: [],
      dispose: () => adapter.stopAll(),
    })
  }

  /** Returns an unavailable snapshot when the entry cannot be materialized. */
  private async materialize(entry: ProviderInstanceConfig, instanceCountForKind: number) {
    const driver = this.drivers.get(entry.driverKind)
    if (!driver) {
      return unavailableSnapshot(entry, `Driver '${entry.driverKind}' is not registered.`)
    }
    if (!driver.capabilities.multiInstance && instanceCountForKind > 1) {
      return unavailableSnapshot(
        entry,
        `Driver '${entry.driverKind}' supports only one instance at a time.`,
      )
    }

    const existing = this.instances.get(entry.providerInstanceId)
    if (existing && configEqual(existing.config, entry)) return null
    if (existing) {
      this.instances.delete(entry.providerInstanceId)
      await disposeInstance(entry.providerInstanceId, existing)
    }

    try {
      await this.create(driver, entry)
      return null
    } catch (error) {
      recordChatPipelineWarning('chat.pipeline.provider_registry.instance_failed', {
        driverKind: entry.driverKind,
        error,
        providerInstanceId: entry.providerInstanceId,
      })
      return unavailableSnapshot(entry, instanceFailureMessage(entry, error))
    }
  }

  private async create(driver: AnyProviderDriver, entry: ProviderInstanceConfig) {
    const config = driver.parseConfig(entry.config ?? driver.defaultConfig())
    const env = resolveProviderInstanceEnvironment({
      derived: driver.environment(config),
      overrides: entry.environment,
    })
    const handle = await driver.create({
      ...(entry.binaryPath ? { binaryPath: entry.binaryPath } : {}),
      config,
      displayLabel: entry.displayLabel ?? driver.displayName,
      enabled: entry.enabled ?? true,
      env,
      providerInstanceId: entry.providerInstanceId,
    })

    this.instances.set(entry.providerInstanceId, {
      adapter: handle.adapter,
      config: entry,
      credentialPaths: driver.credentialPaths({ config, env }),
      dispose: handle.dispose,
    })
    // A recycled id must not inherit the previous account's auth state.
    this.statusCache.forget(entry.providerInstanceId)
  }

  private async refreshInstances(providerInstanceIds: readonly ProviderInstanceId[]) {
    const changed: ProviderInstanceId[] = []
    for (const providerInstanceId of providerInstanceIds) {
      const instance = this.instances.get(providerInstanceId)
      if (!instance) continue

      const before = this.statusCache.last(providerInstanceId, instance.config.driverKind)
      const after = await this.refreshSnapshot(providerInstanceId).catch((error) => {
        recordChatPipelineWarning('chat.pipeline.provider_registry.refresh_failed', {
          error,
          providerInstanceId,
        })
        return null
      })
      if (after && !sameAvailability(before, after)) changed.push(providerInstanceId)
    }

    if (changed.length === 0) return

    recordChatPipelineInfo('chat.pipeline.provider_registry.availability_changed', {
      providerInstanceIds: changed,
    })
    this.emitChanges()
  }

  /** Keeps `listInstances()` in settings-author order rather than creation order. */
  private reorderInstances(entries: readonly ProviderInstanceConfig[]) {
    const ordered: Array<[ProviderInstanceId, LiveProviderInstance]> = []
    for (const entry of entries) {
      const instance = this.instances.get(entry.providerInstanceId)
      if (!instance) continue

      ordered.push([entry.providerInstanceId, instance])
    }

    this.instances.clear()
    for (const [providerInstanceId, instance] of ordered) {
      this.instances.set(providerInstanceId, instance)
    }
  }

  private resetCredentialWatch() {
    if (this.changeListeners.size === 0) {
      this.credentialWatch.stop()
      return
    }

    this.credentialWatch.reset(
      Array.from(this.instances.entries()).map(([providerInstanceId, instance]) => ({
        paths: instance.credentialPaths,
        providerInstanceId,
      })),
    )
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
 * The product registry: built-in drivers, one instance each, status cached on
 * disk so a cold start renders providers without waiting on a CLI probe.
 */
export function createDefaultProviderAdapterRegistry(
  savedInstances: readonly ProviderInstanceConfig[] = [],
) {
  const registry = new ProviderAdapterRegistry({
    drivers: BUILT_IN_PROVIDER_DRIVERS,
    statusCache: new ProviderStatusCache({ directory: defaultProviderStatusCacheDir() }),
  })
  // Reconciled against the settings document rather than a constant. Passing
  // `DEFAULT_PROVIDER_INSTANCES` straight through is what made every
  // configurable field on `providerInstanceConfigSchema` unreadable: the
  // contract carried them, the settings service stored them, and the only
  // caller of `reconcile` never looked.
  void registry.reconcile(mergeProviderInstanceConfigs(DEFAULT_PROVIDER_INSTANCES, savedInstances))

  return registry
}

async function disposeInstance(
  providerInstanceId: ProviderInstanceId,
  instance: LiveProviderInstance,
) {
  try {
    await instance.dispose()
  } catch (error) {
    recordChatPipelineWarning('chat.pipeline.provider_registry.dispose_failed', {
      error,
      providerInstanceId,
    })
  }
}

/**
 * A transient probe failure must not empty the model picker mid-session: an
 * errored snapshot keeps whatever models the last good probe reported.
 */
function withRememberedModels(snapshot: ProviderSnapshot, previous: ProviderSnapshot | null) {
  if (snapshot.models.length > 0) return snapshot
  if (!previous || previous.models.length === 0) return snapshot
  if (snapshot.status === 'ready') return snapshot

  return { ...snapshot, models: previous.models }
}

function sameAvailability(before: ProviderSnapshot | null, after: ProviderSnapshot) {
  if (!before) return false

  return (
    before.auth.status === after.auth.status &&
    before.availability === after.availability &&
    before.installed === after.installed &&
    before.status === after.status
  )
}

function instanceFailureMessage(entry: ProviderInstanceConfig, error: unknown) {
  const detail = error instanceof Error ? error.message : String(error)

  return `Provider instance '${entry.providerInstanceId}' could not be created: ${detail}`
}

function unavailableSnapshot(entry: ProviderInstanceConfig, reason: string): ProviderSnapshot {
  return {
    auth: { status: 'unknown' },
    availability: 'unavailable',
    checkedAt: new Date().toISOString(),
    displayLabel: entry.displayLabel ?? entry.driverKind,
    driverKind: entry.driverKind,
    enabled: false,
    installed: false,
    message: reason,
    models: [],
    providerInstanceId: entry.providerInstanceId,
    runtimeModes: [],
    status: 'error',
    traits: {
      supportsApprovals: false,
      supportsFullAccess: false,
      supportsInterrupt: false,
      supportsSessionStop: false,
      supportsStreaming: false,
      supportsUserInput: false,
    },
    version: null,
  }
}

function configEqual(left: ProviderInstanceConfig, right: ProviderInstanceConfig) {
  return JSON.stringify(left) === JSON.stringify(right)
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
