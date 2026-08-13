/**
 * Value schemas for the settings registry.
 *
 * The whole-document schema that used to live here is gone: settings are a flat
 * registry of dotted keys now, and each of these is one key's `schema`.
 */
import * as v from 'valibot'
import { providerInstanceIdSchema } from './chat-ids'
import { trimmedNonEmptyStringSchema } from './chat-model'
import { providerDriverKindSchema } from './orchestration-runtime'

const ENVIRONMENT_VARIABLE_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/
const KEYBINDING_COMMAND_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_.-]*$/

/**
 * One environment variable handed to a provider process. `value` is stored in
 * the clear, so this is for `PATH`-style knobs, not credentials: nothing here
 * is encrypted and the settings route returns it verbatim.
 */
/**
 * What a stored environment value is replaced with on its way to a client.
 *
 * Provider environment variables are where an API token ends up, and the
 * settings document is served over HTTP. Sending the real value would put every
 * secret in the app behind nothing but an origin check — and into any log,
 * devtools pane or crash report that captures a response body.
 *
 * Sent back unchanged, it means "keep what is stored". Without that rule the
 * first save after a read would overwrite every secret with the mask.
 */
export const REDACTED_SETTINGS_VALUE = '••••••••'

export const providerEnvironmentVariableSchema = v.object({
  name: v.pipe(
    trimmedNonEmptyStringSchema,
    v.maxLength(128),
    v.regex(ENVIRONMENT_VARIABLE_NAME_PATTERN),
  ),
  value: v.optional(v.string(), ''),
})

/**
 * A configured provider instance — the unit the adapter registry reconciles
 * against. `providerInstanceId` is the routing key threads and sessions already
 * store; `driverKind` picks the implementation behind it, so two instances of
 * the same driver (`codex-personal`, `codex-work`) are ordinary here.
 *
 * `driverKind` is an open slug on purpose: settings written by a build that
 * knows a driver must still parse in a build that does not. Reconciling that
 * down to "unavailable" is the registry's job, not the contract's.
 *
 * `config` is an opaque, driver-owned envelope. Keeping it unknown here means a
 * driver can grow its own options without a contract change, and an entry for a
 * driver this build cannot load still round-trips through a save untouched.
 */
export const providerInstanceConfigSchema = v.object({
  providerInstanceId: providerInstanceIdSchema,
  driverKind: providerDriverKindSchema,
  /** `null` keeps the driver's own label instead of pinning a user-facing one. */
  displayLabel: v.optional(v.nullable(trimmedNonEmptyStringSchema), null),
  enabled: v.optional(v.boolean(), true),
  /** Empty string means "resolve the driver's binary from `PATH`". */
  binaryPath: v.optional(v.pipe(v.string(), v.trim()), ''),
  environment: v.optional(v.array(providerEnvironmentVariableSchema), []),
  config: v.optional(v.record(v.string(), v.unknown()), {}),
})

/**
 * Ordered rather than keyed by id: the order is what the provider picker shows.
 * Ids stay unique because the registry routes by them — two entries claiming
 * one id would make routing depend on iteration order.
 */
export const providerInstanceConfigsSchema = v.pipe(
  v.array(providerInstanceConfigSchema),
  v.check(hasUniqueProviderInstanceIds, 'providerInstanceId must be unique across instances'),
)

/** Points at one model of one configured instance. */
export const modelRefSchema = v.object({
  providerInstanceId: providerInstanceIdSchema,
  model: trimmedNonEmptyStringSchema,
})

export const modelRefListSchema = v.pipe(
  v.array(modelRefSchema),
  v.check(hasUniqueModelRefs, 'model references must be unique within a list'),
)

export const keybindingCommandIdSchema = v.pipe(
  trimmedNonEmptyStringSchema,
  v.maxLength(120),
  v.regex(KEYBINDING_COMMAND_ID_PATTERN),
)

/**
 * Command id → hotkey that replaces the built-in binding. `null` is an explicit
 * unbind, which is why the value is nullable instead of the key being deleted:
 * a missing key means "keep the default", a null one means "there is none".
 */
export const keybindingOverridesSchema = v.record(
  keybindingCommandIdSchema,
  v.nullable(trimmedNonEmptyStringSchema),
)

export type ProviderEnvironmentVariable = v.InferOutput<typeof providerEnvironmentVariableSchema>
export type ProviderInstanceConfig = v.InferOutput<typeof providerInstanceConfigSchema>
export type ModelRef = v.InferOutput<typeof modelRefSchema>
export type KeybindingOverrides = v.InferOutput<typeof keybindingOverridesSchema>

/** Stable identity for a model across the hidden and order lists. */
export function modelRefKey(ref: ModelRef): string {
  return `${ref.providerInstanceId} ${ref.model}`
}

function hasUniqueProviderInstanceIds(instances: ProviderInstanceConfig[]): boolean {
  const seen = new Set<string>()

  for (const instance of instances) {
    if (seen.has(instance.providerInstanceId)) return false
    seen.add(instance.providerInstanceId)
  }

  return true
}

function hasUniqueModelRefs(refs: ModelRef[]): boolean {
  const seen = new Set<string>()

  for (const ref of refs) {
    const key = modelRefKey(ref)
    if (seen.has(key)) return false
    seen.add(key)
  }

  return true
}
