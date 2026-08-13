import {
  descriptorFor,
  isSettingId,
  layerAllowsScope,
  resolveSettings,
  type SettingId,
  type SettingsLayer,
  type SettingsLayerId,
  type SettingsSnapshot,
  type SettingsValues,
  type SettingsWriteRequest,
  type SettingsWriteTarget,
} from '@workspace/contracts'
import * as v from 'valibot'
import { recordRequestContext } from '../observability'
import { SettingsFileLayer } from './layer'
import type { DocumentEdit } from './json-document'
import { settingsPaths, type SettingsPathOptions } from './paths'
import {
  applyProviderSecrets,
  extractProviderSecrets,
  maskProviderSecrets,
  SecretStore,
  type SecretRef,
} from './secrets'
import { settingsErrors } from './structured-errors'

// `as const` matters: annotating this as `SettingId` widens the key and turns
// every `values[PROVIDER_INSTANCES]` lookup into a union of every setting type.
const PROVIDER_INSTANCES = 'providers.instances' as const

export type SettingsStoreOptions = SettingsPathOptions & {
  /** Parsed strictly by the caller: a malformed policy is an operator error, not a user's. */
  readonly policy?: Record<string, unknown>
  readonly watch?: boolean
}

/**
 * Server-authoritative settings over layered JSON files.
 *
 * The file is the source of truth in both directions: the UI writes it and the
 * watcher reads it back, so a hand-edit and a click are the same event by the
 * time anything downstream sees them.
 */
export class SettingsStore {
  private readonly user: SettingsFileLayer
  private readonly workspace: SettingsFileLayer | null
  private readonly secretStore: SecretStore
  private readonly policy: Record<string, unknown>
  private readonly listeners = new Set<(snapshot: SettingsSnapshot) => void>()

  private resolved: SettingsValues | null = null
  private cachedSnapshot: SettingsSnapshot | null = null
  /**
   * Which secrets exist, so the synchronous snapshot can mask without an await.
   * Only the refs are held — never the values.
   */
  private secretRefs: ReadonlySet<SecretRef> = new Set()

  constructor(options: SettingsStoreOptions) {
    const paths = settingsPaths(options)
    this.user = new SettingsFileLayer('user', paths.user)
    this.workspace = paths.workspace ? new SettingsFileLayer('workspace', paths.workspace) : null
    this.secretStore = new SecretStore(paths.secrets)
    this.policy = options.policy ?? {}

    // Read synchronously at construction: the provider registry is built from
    // these values inside the same synchronous `createApp` call.
    for (const layer of this.fileLayers()) layer.loadSync()
    this.secretRefs = new Set(this.secretStore.readSync().keys())

    if (options.watch === false) return
    for (const layer of this.fileLayers()) {
      layer.watch(() => this.invalidate())
    }
  }

  snapshot(): SettingsSnapshot {
    if (this.cachedSnapshot) return this.cachedSnapshot

    const resolution = resolveSettings(this.layers(), { previous: this.resolved ?? undefined })
    this.resolved = resolution.values
    this.cachedSnapshot = {
      values: {
        ...resolution.values,
        // Masked here rather than at the route, so there is exactly one place a
        // provider environment can leave the process and it is the safe one.
        [PROVIDER_INSTANCES]: maskProviderSecrets(
          resolution.values[PROVIDER_INSTANCES],
          this.secretRefs,
        ),
      },
      diagnostics: [...resolution.diagnostics],
      layers: this.layerSnapshots(),
      revision: this.user.snapshot().revision ?? '',
    }

    return this.cachedSnapshot
  }

  /**
   * Provider instances with their secrets put back, for the spawn path only.
   * Never handed to a route — the document the client sees has names, not values.
   */
  async providerInstancesForSpawn(): Promise<SettingsValues[typeof PROVIDER_INSTANCES]> {
    const secrets = await this.secretStore.read()

    return applyProviderSecrets(this.snapshot().values[PROVIDER_INSTANCES], secrets)
  }

  /**
   * The same values, for the one caller that cannot await: `createApp` is
   * synchronous and builds the provider registry inline, so without this the
   * registry's first spawn gets the masked document and every provider starts
   * with the redaction glyph for a credential.
   */
  providerInstancesForSpawnSync(): SettingsValues[typeof PROVIDER_INSTANCES] {
    return applyProviderSecrets(
      this.snapshot().values[PROVIDER_INSTANCES],
      this.secretStore.readSync(),
    )
  }

  async write(request: SettingsWriteRequest): Promise<SettingsSnapshot> {
    const byTarget = new Map<SettingsWriteTarget, DocumentEdit[]>()
    const secretEdits = new Map<SecretRef, string | null>()
    // `''` is what the snapshot reports for a file that does not exist yet, and
    // `null` is what the disk reports for the same thing. Without this they
    // compare unequal and the first write on a fresh install is refused.
    const baseRevision =
      request.baseRevision === undefined ? undefined : request.baseRevision || null

    for (const edit of request.edits) {
      this.assertWritable(edit.key, edit.target)
      const prepared = this.prepare(edit.key, edit.value, secretEdits)
      const existing = byTarget.get(edit.target)
      if (existing) {
        existing.push(prepared)
        continue
      }

      byTarget.set(edit.target, [prepared])
    }

    // Secrets first: a settings file naming a variable whose value never landed
    // is recoverable, the reverse leaves a secret with nothing referencing it.
    await this.secretStore.write(secretEdits)
    for (const [target, edits] of byTarget) {
      // Only the user layer: `revision` on the snapshot is that layer's, so it
      // is the only one the client's `baseRevision` can be talking about.
      await this.layerFor(target).write(edits, target === 'user' ? baseRevision : undefined)
    }

    this.invalidate()
    recordRequestContext({
      area: 'settings',
      operation: 'write',
      settings: {
        // Ids and counts only. Values never reach the log — some of them are the
        // provider environment, and this file is one the agent itself can read.
        settingIds: request.edits.map((edit) => edit.key),
        secretsChanged: secretEdits.size,
      },
    })

    return this.snapshot()
  }

  /**
   * The raw file text, for the JSON escape hatch.
   *
   * Safe to serve only because secrets are not in this file — the split is what
   * lets the hatch, the export, and the editor tab exist at all.
   */
  rawLayer(target: SettingsWriteTarget): { text: string; revision: string } {
    const contents = this.layerFor(target).snapshot()

    return { text: contents.text, revision: contents.revision ?? '' }
  }

  async writeRaw(
    target: SettingsWriteTarget,
    text: string,
    baseRevision?: string,
  ): Promise<SettingsSnapshot> {
    await this.layerFor(target).writeText(text, baseRevision)
    this.invalidate()

    return this.snapshot()
  }

  onChange(listener: (snapshot: SettingsSnapshot) => void): () => void {
    this.listeners.add(listener)

    return () => this.listeners.delete(listener)
  }

  async *changes(signal?: AbortSignal): AsyncGenerator<SettingsSnapshot> {
    const queue: SettingsSnapshot[] = []
    let wake: (() => void) | null = null
    const stop = this.onChange((snapshot) => {
      queue.push(snapshot)
      wake?.()
    })
    // Registered once, not per park. `{ once: true }` only removes a listener
    // that actually fired, and this one does not fire on the ordinary wake — so
    // arming it inside the loop left one dead listener per delivered snapshot,
    // for the life of the connection.
    const onAbort = () => wake?.()
    signal?.addEventListener('abort', onAbort, { once: true })

    try {
      while (!signal?.aborted) {
        if (queue.length === 0) {
          await new Promise<void>((resolve) => {
            wake = resolve
          })
          wake = null
          continue
        }

        yield queue.shift() as SettingsSnapshot
      }
    } finally {
      signal?.removeEventListener('abort', onAbort)
      stop()
    }
  }

  close(): void {
    for (const layer of this.fileLayers()) layer.close()
    this.listeners.clear()
  }

  private prepare(
    key: SettingId,
    value: unknown,
    secretEdits: Map<SecretRef, string | null>,
  ): DocumentEdit {
    if (value === undefined) return { key }

    const descriptor = descriptorFor(key)
    const parsed = v.safeParse(descriptor.schema, value)
    if (!parsed.success) {
      throw settingsErrors.WRITE_INVALID({
        key,
        reason: v.summarize(parsed.issues).replaceAll('\n', ' '),
      })
    }

    if (key !== PROVIDER_INSTANCES) return { key, value: parsed.output }

    const split = extractProviderSecrets(parsed.output)
    for (const [ref, secret] of split.secrets) secretEdits.set(ref, secret)

    return { key, value: split.instances }
  }

  private assertWritable(key: SettingId, target: SettingsWriteTarget) {
    if (!isSettingId(key)) throw settingsErrors.UNKNOWN_KEY({ key })
    if (Object.hasOwn(this.policy, key)) throw settingsErrors.POLICY_CONTROLLED({ key })

    const { scope } = descriptorFor(key)
    if (layerAllowsScope(target, scope)) return

    throw settingsErrors.SCOPE_NOT_ALLOWED({ key, scope, target })
  }

  private layerFor(target: SettingsWriteTarget): SettingsFileLayer {
    if (target === 'user') return this.user
    if (this.workspace) return this.workspace

    throw settingsErrors.SCOPE_NOT_ALLOWED({
      key: 'workspace settings',
      scope: 'window',
      target: 'workspace (no folder open)',
    })
  }

  private fileLayers(): SettingsFileLayer[] {
    return this.workspace ? [this.user, this.workspace] : [this.user]
  }

  private layers(): SettingsLayer[] {
    const layers: SettingsLayer[] = this.fileLayers().map((layer) => ({
      id: layer.id,
      raw: layer.snapshot().raw,
    }))
    if (Object.keys(this.policy).length > 0) layers.push({ id: 'policy', raw: this.policy })

    return layers
  }

  private layerSnapshots() {
    const files = this.fileLayers().map((layer) => ({
      id: layer.id as SettingsLayerId,
      present: layer.snapshot().present,
      raw: layer.snapshot().raw as Record<string, unknown>,
    }))
    if (Object.keys(this.policy).length === 0) return files

    return [...files, { id: 'policy' as SettingsLayerId, present: true, raw: this.policy }]
  }

  private invalidate() {
    this.cachedSnapshot = null
    // Re-read on every invalidation, not only when *we* wrote a secret. The
    // secret file has no watcher, so a hand-edit is otherwise invisible: the
    // page would show a set variable as empty, and the next save of that row
    // sends `''` back, which the write path reads as "delete it".
    this.secretRefs = new Set(this.secretStore.readSync().keys())
    const snapshot = this.snapshot()

    for (const listener of this.listeners) {
      // The file is already written by the time listeners run. Letting one throw
      // out of here would report "save failed" for a save that happened, and the
      // user would retry a write already on disk.
      try {
        listener(snapshot)
      } catch (error) {
        recordRequestContext({
          area: 'settings',
          operation: 'notify',
          settingsListenerError: error,
        })
      }
    }
  }
}
