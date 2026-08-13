import * as v from 'valibot'
import { isRecord } from '../is-record'

/**
 * A dotted key, lowercase-ish, with no empty segments. Deliberately rejects the
 * `[language]` bracket form: language-specific overrides are not part of this
 * design, and a key shaped like one would parse here and mean nothing later.
 */
const SETTING_ID_PATTERN = /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/

/**
 * Where a value is allowed to come from.
 *
 * This is a security boundary before it is an ergonomics one. A workspace file
 * ships inside a cloned repository, so it is attacker-controlled input, and the
 * scope is the only thing standing between a repo and the values it can set.
 *
 * - `application` — the user file only. App-wide, no per-project meaning.
 * - `machine` — the user file only, and machine-specific: paths, binaries,
 *   window chrome. Never synced even if syncing arrives.
 * - `window` — the user file or a workspace file.
 * - `resource` — as `window`; reserved for per-file/per-language keys.
 *
 * The rule that decides between them: a value reaching **execution** — selecting
 * a binary, setting env, becoming a flag name, or binding a key — is
 * `application` or `machine`, never `window`. A value reaching only
 * **suppression** — a data operand after a fixed flag, worst case hiding
 * results — may be `window`, and then it must be visibly indicated when a
 * workspace sets it.
 */
export type SettingScope = 'application' | 'machine' | 'window' | 'resource'

/** Which control the settings page renders. Presentation only; never affects resolution. */
export type SettingWidget =
  | 'boolean'
  | 'font'
  | 'number'
  | 'string'
  | 'multiline'
  | 'enum'
  | 'list'
  | 'record'
  | 'providers'
  | 'models'
  | 'complex'

/**
 * `user` is the default page. `advanced` is searchable but collapsed. `internal`
 * is reachable only through the JSON view — it exists so an engineering constant
 * can be overridable and greppable without cluttering the page.
 */
export type SettingVisibility = 'user' | 'advanced' | 'internal'

/**
 * How two layers combine for one key.
 *
 * `replace` is right for almost everything: a later layer wins outright.
 * `record` is opt-in for keyed maps where a workspace should be able to add an
 * entry without erasing the user's — `keybindings.overrides` is the case that
 * motivates it.
 */
export type SettingMerge = 'replace' | 'record'

export type SettingDescriptor<TSchema extends v.GenericSchema = v.GenericSchema> = {
  /** Validates a stored value. Also the source of the key's TypeScript type. */
  readonly schema: TSchema
  /**
   * Bound to `schema` on purpose: `v.InferOutput<TSchema>` makes a mistyped
   * default a compile error rather than a runtime surprise on first read.
   */
  readonly default: v.InferOutput<TSchema>
  readonly scope: SettingScope
  readonly widget: SettingWidget
  /** Groups the key on the page. Explicit, so a rename cannot silently regroup it. */
  readonly category: string
  readonly description: string
  readonly visibility?: SettingVisibility
  readonly merge?: SettingMerge
  /** Extra words the page's search should match beyond id, category and description. */
  readonly keywords?: readonly string[]
  /** The value is never logged, never served, and never written to the settings file. */
  readonly sensitive?: boolean
  /** Changing it does nothing until the app or server restarts; the page must say so. */
  readonly requiresRestart?: boolean
  /** Shown but not editable, with this as the stated reason. */
  readonly readOnlyReason?: string
  /** Why the key still exists and what replaced it. */
  readonly deprecationReason?: string
}

/**
 * Identity function whose only job is to bind `default` to `schema`.
 *
 * Written as a per-entry generic rather than a constraint on the whole table:
 * a whole-map `Record<string, SettingDescriptor<unknown>>` constraint widens
 * `default` to `unknown` and then accepts `{ schema: v.boolean(), default: 3 }`
 * without complaint. Per-entry, that is a type error at the call site.
 */
export function defineSetting<TSchema extends v.GenericSchema>(
  descriptor: SettingDescriptor<TSchema>,
): SettingDescriptor<TSchema> {
  return descriptor
}

export type SettingsRegistryShape = Readonly<Record<string, SettingDescriptor>>

/**
 * The typed document a registry produces. `SettingsValues` is this applied to
 * the real table; the resolver is generic over it so it can be exercised
 * against a fixture registry with scopes the shipping table does not yet use.
 */
export type RegistryValues<TRegistry extends SettingsRegistryShape> = {
  [K in keyof TRegistry]: v.InferOutput<TRegistry[K]['schema']>
}

export type RegistryProblem = {
  readonly id: string
  readonly reason: string
}

/**
 * Checks what the type system cannot.
 *
 * Duplicate ids need no check — they are object literal keys, so the compiler
 * rejects them. What survives compilation is a malformed id and a default that
 * satisfies the *type* but fails the schema's own refinements (`v.maxLength`,
 * `v.regex`, a `v.check` on a list). Both are caught here, and a test calls this
 * so the failure lands at `bun run test` rather than on a user's first read.
 *
 * Not run at module load: the package declares `sideEffects: false`, and a
 * throwing import would make that a lie.
 */
export function registryProblems(registry: SettingsRegistryShape): RegistryProblem[] {
  const problems: RegistryProblem[] = []

  for (const [id, descriptor] of Object.entries(registry)) {
    if (!SETTING_ID_PATTERN.test(id)) {
      problems.push({ id, reason: 'id must be dotted lowerCamel segments, e.g. editor.fontSize' })
    }

    const parsed = v.safeParse(descriptor.schema, descriptor.default)
    if (!parsed.success) {
      problems.push({ id, reason: `default does not parse: ${v.summarize(parsed.issues)}` })
    }

    if (descriptor.merge === 'record' && !isRecord(descriptor.default)) {
      problems.push({ id, reason: "merge: 'record' requires an object default" })
    }
  }

  return problems
}
