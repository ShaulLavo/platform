import {
  modelRefKey,
  type KeybindingOverrides,
  type ModelPreferences,
  type ModelRef,
  type ProviderInstanceConfig,
} from '@workspace/contracts'

/**
 * Sections are replaced whole, so every edit rebuilds the list it touches
 * rather than sending a delta the server would have to merge.
 */
/**
 * Toggling a provider the document has never mentioned appends it rather than
 * doing nothing.
 *
 * The built-in instances live in the registry, not in settings, so an untouched
 * install has an empty list — and mapping over it silently dropped every toggle
 * of the only two providers that exist. The appended entry is the driver's own
 * configuration with `enabled` changed, which is exactly what layering over the
 * defaults expects to receive.
 */
export function withProviderEnabled(
  instances: readonly ProviderInstanceConfig[],
  instance: ProviderInstanceConfig,
  enabled: boolean,
): ProviderInstanceConfig[] {
  const known = instances.some((saved) => saved.providerInstanceId === instance.providerInstanceId)
  if (!known) return instances.concat({ ...instance, enabled })

  return instances.map((saved) => {
    if (saved.providerInstanceId !== instance.providerInstanceId) return saved

    return { ...saved, enabled }
  })
}

export function withModelHidden(
  preferences: ModelPreferences,
  ref: ModelRef,
  hidden: boolean,
): ModelPreferences {
  const key = modelRefKey(ref)
  const without = preferences.hidden.filter((entry) => modelRefKey(entry) !== key)

  return {
    hidden: hidden ? [...without, ref] : without,
    order: preferences.order,
  }
}

export function withKeybindingOverride(
  overrides: KeybindingOverrides,
  command: string,
  keys: string | null,
): KeybindingOverrides {
  return { ...overrides, [command]: keys }
}

/**
 * Dropping the key, not writing `null` over it: `null` is an explicit unbind,
 * so only an absent key hands the command back to its default.
 */
export function withoutKeybindingOverride(
  overrides: KeybindingOverrides,
  command: string,
): KeybindingOverrides {
  return Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== command))
}
