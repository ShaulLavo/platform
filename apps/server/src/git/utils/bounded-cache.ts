/**
 * The git service's cache primitive: string-keyed, capacity-bounded, TTL-bounded,
 * and single-flight. Every entry holds the in-flight promise rather than the
 * settled value, so N concurrent status polls for one repository run one `git`
 * process. A rejected load is dropped instead of cached — a failure has no
 * freshness to serve, and caching one would extend a transient error over the
 * whole TTL.
 *
 * TTL may be a function of the resolved value, which is how a "no repository
 * here" answer gets its own (negative) lifetime without a second cache.
 */

type CacheEntry<Value> = {
  /** `null` while the load is in flight: an unsettled entry has no freshness to lose. */
  expiresAt: number | null
  value: Promise<Value>
}

type BoundedTtlCacheOptions<Value> = {
  capacity: number
  now?: () => number
  ttlMs: number | ((value: Value) => number)
}

export class BoundedTtlCache<Value> {
  private readonly capacity: number
  private readonly entries = new Map<string, CacheEntry<Value>>()
  private readonly now: () => number
  private readonly ttlMs: number | ((value: Value) => number)

  constructor(options: BoundedTtlCacheOptions<Value>) {
    this.capacity = options.capacity
    this.now = options.now ?? Date.now
    this.ttlMs = options.ttlMs
  }

  get size() {
    this.purgeExpired()
    return this.entries.size
  }

  read(key: string) {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (!this.isExpired(entry)) return entry.value

    this.entries.delete(key)
    return undefined
  }

  load(key: string, loader: () => Promise<Value>): Promise<Value> {
    const cached = this.read(key)
    if (cached) return cached

    const pending = loader()
    this.write(key, pending)

    return pending.then(
      (value) => {
        this.stamp(key, pending, value)
        return value
      },
      (error: unknown) => {
        this.evict(key, pending)
        throw error
      },
    )
  }

  /** Explicit invalidation for every entry a single repository owns. */
  invalidatePrefix(prefix: string) {
    for (const key of this.entries.keys()) {
      if (!key.startsWith(prefix)) continue

      this.entries.delete(key)
    }
  }

  private write(key: string, value: Promise<Value>) {
    this.purgeExpired()
    this.entries.delete(key)
    this.entries.set(key, { expiresAt: null, value })
    this.trimToCapacity()
  }

  private stamp(key: string, pending: Promise<Value>, value: Value) {
    const entry = this.entries.get(key)
    if (entry?.value !== pending) return

    entry.expiresAt = this.now() + this.ttlMsForValue(value)
  }

  private evict(key: string, pending: Promise<Value>) {
    if (this.entries.get(key)?.value !== pending) return

    this.entries.delete(key)
  }

  private ttlMsForValue(value: Value) {
    if (typeof this.ttlMs === 'number') return this.ttlMs

    return this.ttlMs(value)
  }

  private purgeExpired() {
    for (const [key, entry] of this.entries) {
      if (!this.isExpired(entry)) continue

      this.entries.delete(key)
    }
  }

  /** Insertion-ordered `Map`, so the oldest write is the first key out. */
  private trimToCapacity() {
    while (this.entries.size > this.capacity) {
      const key = this.entries.keys().next().value
      if (key === undefined) return

      this.entries.delete(key)
    }
  }

  private isExpired(entry: CacheEntry<Value>) {
    if (entry.expiresAt === null) return false

    return entry.expiresAt <= this.now()
  }
}
