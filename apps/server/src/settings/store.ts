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
import { errorSummary, recordRequestContext, recordRequestWarning } from '../observability'
import { SettingsFileLayer } from './layer'
import { editSettingsText, parseSettingsDocument, type DocumentEdit } from './json-document'
import { settingsPaths, type SettingsPathOptions } from './paths'
import {
  applyProviderSecrets,
  extractProviderSecrets,
  extractRawProviderSecrets,
  maskProviderSecrets,
  SecretStore,
  type SecretRef,
} from './secrets'
import { settingsErrors } from './structured-errors'

// `as const` matters: annotating this as `SettingId` widens the key and turns
// every `values[PROVIDER_INSTANCES]` lookup into a union of every setting type.
const PROVIDER_INSTANCES = 'providers.instances' as const

/**
 * A ref set that answers "yes" for every ref, so the mask can be driven to its
 * safe direction through the one existing masking call rather than a second one.
 *
 * `has` is the only member `maskProviderSecrets` touches; the cast is what lets
 * a predicate stand in for a `Set` without widening that function's contract.
 */
const EVERY_SECRET_REF = { has: () => true } as unknown as ReadonlySet<SecretRef>

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
  private readonly secretsPath: string
  private readonly policy: Record<string, unknown>
  private readonly listeners = new Set<(snapshot: SettingsSnapshot) => void>()

  private resolved: SettingsValues | null = null
  private cachedSnapshot: SettingsSnapshot | null = null
  /**
   * Which secrets exist, so the synchronous snapshot can mask without an await.
   * Only the refs are held — never the values.
   */
  private secretRefs: ReadonlySet<SecretRef> = new Set()
  /**
   * Set when a reload could not read the secret store, which makes `secretRefs`
   * a stale answer to "which variables are set". While it is set the snapshot
   * masks every variable rather than trusting those refs — see `maskingRefs`.
   */
  private secretRefsStale = false

  constructor(options: SettingsStoreOptions) {
    const paths = settingsPaths(options)
    this.secretsPath = paths.secrets
    this.user = new SettingsFileLayer('user', paths.user)
    this.workspace = paths.workspace ? new SettingsFileLayer('workspace', paths.workspace) : null
    this.secretStore = new SecretStore(paths.secrets)
    this.policy = options.policy ?? {}

    // Read synchronously at construction: the provider registry is built from
    // these values inside the same synchronous `createApp` call.
    for (const layer of this.fileLayers()) layer.loadSync()
    // Deliberately *not* the tolerant treatment `invalidate()` gets. A reload
    // has a running app to keep serving; construction has nothing yet, and
    // starting with an unreadable secret store hands every provider spawn an
    // empty credential — a failure that shows up far from its cause. Refusing to
    // start is better, as long as it names the file instead of raising EISDIR.
    try {
      this.secretRefs = new Set(this.secretStore.readSync().keys())
    } catch (error) {
      throw settingsErrors.SECRETS_UNREADABLE({
        file: paths.secrets,
        detail: error instanceof Error ? error.message : String(error),
        cause: error instanceof Error ? error : undefined,
      })
    }

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
          this.maskingRefs(),
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

  /**
   * Whole-text replace, for the JSON escape hatch.
   *
   * Runs the same secret split the keyed path runs. Without it this is the one
   * route that can land a provider credential in the settings document, where it
   * would sit in cleartext in the very file `GET /settings/raw`, the JSON tab and
   * export all serve — and then be replaced by an empty string at spawn, because
   * `applyProviderSecrets` reads every environment value from the secret store.
   * The file says the variable is set, the provider starts without it, and
   * nothing anywhere says why.
   *
   * Unknown, out-of-scope and policy-controlled keys are deliberately *not*
   * refused here the way `write` refuses them: the resolver reports each as a
   * diagnostic and drops it, and keeping another build's keys in the file is
   * this hatch's job.
   */
  async writeRaw(
    target: SettingsWriteTarget,
    text: string,
    baseRevision?: string,
  ): Promise<SettingsSnapshot> {
    const document = this.splitRawSecrets(target, text)

    // Secrets first, for the reason `write` gives: a document naming a variable
    // whose value never landed is recoverable, the reverse is not.
    await this.secretStore.write(document.secrets)
    await this.layerFor(target).writeText(document.text, baseRevision)
    this.invalidate()
    recordRequestContext({
      area: 'settings',
      operation: 'write-raw',
      settings: {
        // Ids and counts only. This route carries the whole document, so a value
        // in the log would be the exact leak the split exists to prevent.
        target,
        settingIds: document.settingIds,
        secretsChanged: document.secrets.size,
      },
    })

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

  /**
   * Takes any provider credential out of incoming raw text before it reaches
   * disk, and returns the text to actually write.
   *
   * A malformed document is handed straight back: `writeText` raises the typed
   * FILE_MALFORMED for it, and storing a secret for a document that is about to
   * be refused would leave a value with nothing referencing it.
   */
  private splitRawSecrets(
    target: SettingsWriteTarget,
    text: string,
  ): { text: string; secrets: Map<SecretRef, string>; settingIds: string[] } {
    const parsed = parseSettingsDocument(text)
    if (parsed.parseErrors.length > 0) return { text, secrets: new Map(), settingIds: [] }

    const settingIds = Object.keys(parsed.values)
    if (!Object.hasOwn(parsed.values, PROVIDER_INSTANCES)) {
      return { text, secrets: new Map(), settingIds }
    }

    const split = extractRawProviderSecrets(parsed.values[PROVIDER_INSTANCES])
    // Nothing to absorb: hand the user's bytes straight back. `editSettingsText`
    // re-serializes the subtree it touches, so rewriting on every save would
    // reformat `providers.instances` and drop any comment inside it — on a save
    // that changed nothing. Byte fidelity is the hatch's whole job.
    if (split.secrets.size === 0) return { text, secrets: split.secrets, settingIds }

    // `providers.instances` is application-scoped precisely because it reaches
    // process spawn, and a workspace file ships inside a cloned repository. The
    // resolver already refuses to *apply* it from there — but that happens after
    // the bytes are on disk, which for this key means a credential committed to
    // someone's repo. Naming the key from a workspace file stays legal, because
    // "set here, not applied" is a diagnostic the page is built to show; only
    // carrying a value is not.
    if (target !== 'user') {
      throw settingsErrors.SCOPE_NOT_ALLOWED({
        key: PROVIDER_INSTANCES,
        scope: 'application',
        target,
      })
    }

    return {
      // `editSettingsText`, not a re-serialize: the hatch has to hand the user's
      // comments and key order back unchanged.
      text: editSettingsText(text, [{ key: PROVIDER_INSTANCES, value: split.instances }]),
      secrets: split.secrets,
      settingIds,
    }
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

  /**
   * Which refs the mask treats as set.
   *
   * While the read is stale the honest answer is "unknown", and the two ways of
   * saying that are not equivalent on the way back in: `REDACTED` round-trips
   * through `extractProviderSecrets` as *leave the stored secret alone*, `''` as
   * *delete it*. So an unknown answer masks everything rather than trusting refs
   * that may no longer match the file.
   */
  private maskingRefs(): ReadonlySet<SecretRef> {
    return this.secretRefsStale ? EVERY_SECRET_REF : this.secretRefs
  }

  /**
   * Re-read on every invalidation, not only when *we* wrote a secret. The secret
   * file has no watcher, so a hand-edit is otherwise invisible: the page would
   * show a set variable as empty, and the next save of that row sends `''` back,
   * which the write path reads as "delete it".
   *
   * A failed read must not abort the invalidation: the settings file is already
   * on disk by then, so unwinding here leaves the change written and nobody
   * told. It degrades instead — flag the refs stale, keep going, recover on the
   * next read that works.
   */
  private reloadSecretRefs() {
    try {
      this.secretRefs = new Set(this.secretStore.readSync().keys())
      this.secretRefsStale = false
    } catch (error) {
      this.secretRefsStale = true
      recordRequestWarning('settings.secrets.unreadable', {
        area: 'settings',
        operation: 'invalidate',
        settings: {
          // The path only. Nothing from inside the file reaches a log — this
          // recorder does not redact, and its contents are credentials.
          secretsPath: this.secretsPath,
          secretRefsStale: true,
        },
        error: errorSummary(error),
      })
    }
  }

  private invalidate() {
    this.cachedSnapshot = null
    this.reloadSecretRefs()
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
