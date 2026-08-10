import {
  modelRefKey,
  type KeybindingOverrides,
  type ModelPreferences,
  type ModelRef,
  type ProviderInstanceConfig,
  type ProviderInstanceId,
} from '@workspace/contracts'

/**
 * Sections are replaced whole, so every edit rebuilds the list it touches
 * rather than sending a delta the server would have to merge.
 */
export function withProviderEnabled(
  instances: readonly ProviderInstanceConfig[],
  providerInstanceId: ProviderInstanceId,
  enabled: boolean,
): ProviderInstanceConfig[] {
  return instances.map((instance) => {
    if (instance.providerInstanceId !== providerInstanceId) return instance

    return { ...instance, enabled }
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
