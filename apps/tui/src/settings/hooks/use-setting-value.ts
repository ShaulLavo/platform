import { useSyncExternalStore } from 'react'
import { DEFAULT_SETTING_VALUES, type SettingId, type SettingsValues } from '@workspace/contracts'
import type { SettingsOwner } from '@workspace/client-core/settings/owner'

import { emptySettingsSubscription } from '@/settings/utils/subscription'

export function useSettingValue<K extends SettingId>(
  owner: SettingsOwner | null,
  key: K,
): SettingsValues[K] {
  return useSyncExternalStore(
    owner?.subscribe ?? emptySettingsSubscription,
    () => owner?.getSnapshot().projection.values[key] ?? DEFAULT_SETTING_VALUES[key],
  )
}
