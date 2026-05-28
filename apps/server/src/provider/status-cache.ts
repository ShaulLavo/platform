import type { ProviderInstanceId, ProviderSnapshot } from '@workspace/contracts'

const DEFAULT_PROVIDER_STATUS_TTL_MS = 60_000

type CacheEntry = {
  checkedAtMs: number
  snapshot: ProviderSnapshot
}

export class ProviderStatusCache {
  private readonly entries = new Map<string, CacheEntry>()
  private readonly ttlMs: number

  constructor(ttlMs = DEFAULT_PROVIDER_STATUS_TTL_MS) {
    this.ttlMs = ttlMs
  }

  get(instanceId: ProviderInstanceId) {
    const entry = this.entries.get(instanceId)
    if (!entry) return null
    if (Date.now() - entry.checkedAtMs > this.ttlMs) return null

    return entry.snapshot
  }

  set(snapshot: ProviderSnapshot) {
    this.entries.set(snapshot.providerInstanceId, {
      checkedAtMs: Date.now(),
      snapshot,
    })
  }
}
