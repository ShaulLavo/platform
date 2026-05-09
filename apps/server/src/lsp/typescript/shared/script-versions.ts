import { statSync } from "node:fs"

/**
 * Per-file version bookkeeping for the TypeScript language service.
 *
 * The language service consults `getScriptVersion(fileName)` to decide whether
 * a cached snapshot is still valid. Every time a script's text may have
 * changed on disk or in an open document the session must bump this counter
 * so the next snapshot fetch invalidates.
 *
 * Current session.ts bumps the counter from three handlers — `didOpen`,
 * `didChange`, and `didClose` — so the registry is shared state (Req 6.2).
 * The getter in turn is consumed by the language-service host's
 * `getScriptVersion` callback, which shares the same `Map` with the mutators.
 * Putting the Map behind this small API keeps every touch point funnelled
 * through a single allocation so future handlers can't drift.
 *
 * Seeding: when the registry sees a fileName for the first time it samples
 * the file's `mtimeMs` as the initial numeric version. Non-existent paths
 * (e.g. virtual files opened only in the editor) seed to `0` so `bump`
 * still produces monotonically increasing values.
 */
export class ScriptVersionRegistry {
  private readonly versions = new Map<string, number>()

  /**
   * Returns the current version for `fileName` as a string (LanguageService
   * expects strings). Seeds the entry from the on-disk mtime the first time
   * a fileName is seen so unopened-but-referenced files still carry a stable
   * version.
   */
  get(fileName: string): string {
    const cached = this.versions.get(fileName)
    if (cached !== undefined) return String(cached)

    const seeded = fileMtimeVersion(fileName)
    this.versions.set(fileName, seeded)
    return String(seeded)
  }

  /**
   * Increments the stored version for `fileName` so the next
   * `getScriptSnapshot` call is treated as stale. Seeds from the on-disk
   * mtime first if `fileName` hasn't been seen yet, then increments.
   */
  bump(fileName: string): void {
    const current = this.versions.get(fileName) ?? fileMtimeVersion(fileName)
    this.versions.set(fileName, current + 1)
  }
}

/** Factory that constructs an empty `ScriptVersionRegistry`. */
export function createScriptVersionRegistry(): ScriptVersionRegistry {
  return new ScriptVersionRegistry()
}

/**
 * Functional wrapper around `registry.get(fileName)` for call sites that
 * prefer the explicit-registry style.
 */
export function scriptVersion(registry: ScriptVersionRegistry, fileName: string): string {
  return registry.get(fileName)
}

/**
 * Functional wrapper around `registry.bump(fileName)` for call sites that
 * prefer the explicit-registry style.
 */
export function bumpScriptVersion(registry: ScriptVersionRegistry, fileName: string): void {
  registry.bump(fileName)
}

function fileMtimeVersion(fileName: string): number {
  try {
    return statSync(fileName).mtimeMs
  } catch {
    return 0
  }
}
