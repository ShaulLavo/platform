import { isRecord, REDACTED_SETTINGS_VALUE } from '@workspace/contracts'
import {
  parseSettingsDocument,
  readSettingsFile,
  readSettingsFileSync,
  writeSettingsFile,
} from './json-document'

/** Owner-only. This file holds API tokens and lives in the user's home directory. */
const SECRETS_FILE_MODE = 0o600

/**
 * Identifies one secret. Deliberately the same pair `restoreRedactedSecrets`
 * already matches on — instance id and variable name, never position — so the
 * wire protocol needs no change; only its backing storage moves.
 */
export type SecretRef = `provider.${string}.env.${string}`

export function providerEnvSecretRef(instanceId: string, variableName: string): SecretRef {
  return `provider.${instanceId}.env.${variableName}`
}

/**
 * Secrets, kept out of the settings document on purpose.
 *
 * Redaction protects the wire. It does nothing for the disk, and the settings
 * file is served raw (`GET /settings/raw`), opened as an editor tab, and copied
 * by export — three paths that would hand the disk straight back to the channel
 * redaction exists to close. Keeping values here instead makes all three safe by
 * construction rather than by a filter someone has to remember.
 *
 * Deliberately dumber than the settings store: no layers, no registry, no
 * watcher, no scope filter. Not encrypted at rest either — `0600` in `$HOME` is
 * what an SSH private key gets, and matching the OS keychain is its own project.
 * If a keychain lands later it replaces these two functions and nothing else.
 */
export class SecretStore {
  private readonly filePath: string

  constructor(filePath: string) {
    this.filePath = filePath
  }

  readSync(): Map<SecretRef, string> {
    return this.toSecrets(readSettingsFileSync(this.filePath).text)
  }

  async read(): Promise<Map<SecretRef, string>> {
    return this.toSecrets((await readSettingsFile(this.filePath)).text)
  }

  private toSecrets(text: string): Map<SecretRef, string> {
    const { values } = parseSettingsDocument(text)
    const secrets = new Map<SecretRef, string>()

    for (const [ref, value] of Object.entries(values)) {
      if (typeof value !== 'string') continue
      secrets.set(ref as SecretRef, value)
    }

    return secrets
  }

  /** A `null` value deletes the entry; the file never keeps an emptied secret. */
  async write(edits: ReadonlyMap<SecretRef, string | null>): Promise<void> {
    if (edits.size === 0) return

    const current = await this.read()
    for (const [ref, value] of edits) {
      if (value === null || value === '') {
        current.delete(ref)
        continue
      }

      current.set(ref, value)
    }

    await this.persist(current)
  }

  private async persist(secrets: ReadonlyMap<SecretRef, string>): Promise<void> {
    // Plain JSON, sorted: this file is never hand-edited, so comment
    // preservation buys nothing and a stable key order keeps diffs quiet.
    const entries = [...secrets.entries()].sort(([a], [b]) => a.localeCompare(b))
    const text = `${JSON.stringify(Object.fromEntries(entries), null, 2)}\n`

    await writeSettingsFile(this.filePath, text, {
      mode: SECRETS_FILE_MODE,
      onRevisionMismatch: () => {
        throw new Error('unreachable: secrets are written without a revision guard')
      },
    })
  }
}

/**
 * Rewrites every environment variable of every instance, keyed by instance id
 * and variable name.
 *
 * Matching on the pair rather than on position is the rule the wire protocol
 * already follows: reordering or removing rows must never move a secret onto a
 * different variable.
 */
function mapEnvironment(
  instances: unknown,
  rewrite: (ref: SecretRef, value: string) => string,
): unknown {
  if (!Array.isArray(instances)) return instances

  return instances.map((instance) => {
    if (!isRecord(instance) || !Array.isArray(instance.environment)) return instance

    const id = typeof instance.providerInstanceId === 'string' ? instance.providerInstanceId : ''
    const environment = instance.environment.map((variable) => {
      if (!isRecord(variable) || typeof variable.name !== 'string') return variable

      const value = typeof variable.value === 'string' ? variable.value : ''

      return { ...variable, value: rewrite(providerEnvSecretRef(id, variable.name), value) }
    })

    return { ...instance, environment }
  })
}

/**
 * Splits an incoming provider list into what the document stores and what the
 * secret store stores.
 *
 * The document always holds an empty value — no secret, and no fake marker
 * either. Whether a variable is *set* is a fact about the secret store, which is
 * where the snapshot reads it from. That keeps the file honest for a person
 * reading it and keeps "not set" distinguishable from "set to something I am not
 * showing you", which is the distinction the wire protocol was careful about.
 *
 * A value that comes back as the mask means "keep what is stored", so it
 * produces no secret edit at all. Without that rule the first save after a read
 * would wipe every secret.
 */
export function extractProviderSecrets(instances: unknown): {
  readonly instances: unknown
  readonly secrets: Map<SecretRef, string | null>
} {
  const secrets = new Map<SecretRef, string | null>()
  const stripped = mapEnvironment(instances, (ref, value) => {
    if (value !== REDACTED_SETTINGS_VALUE) secrets.set(ref, value === '' ? null : value)

    return ''
  })

  return { instances: stripped, secrets }
}

/** Puts stored values back on their variables, for the spawn path only. */
export function applyProviderSecrets<T>(instances: T, secrets: ReadonlyMap<SecretRef, string>): T {
  return mapEnvironment(instances, (ref) => secrets.get(ref) ?? '') as T
}

/**
 * What a client sees: the mask where a secret exists, empty where none does.
 * Never the value — this is the only shape that leaves the process.
 */
export function maskProviderSecrets<T>(instances: T, secrets: ReadonlySet<SecretRef>): T {
  return mapEnvironment(instances, (ref) => (secrets.has(ref) ? REDACTED_SETTINGS_VALUE : '')) as T
}
