import { DEFAULT_SETTING_VALUES, type SettingId, type SettingsValues } from '@workspace/contracts'

import { useSettings } from './use-settings'

/**
 * One setting, typed, with the registry default until the snapshot lands.
 *
 * The read every consumer outside this feature uses, so no component has to
 * index the raw document or know the query key.
 */
export function useSettingValue<K extends SettingId>(key: K): SettingsValues[K] {
  const settings = useSettings()

  return settings.data?.values[key] ?? DEFAULT_SETTING_VALUES[key]
}
