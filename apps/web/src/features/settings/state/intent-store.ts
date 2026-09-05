import { useStore } from 'zustand'
import { settingsIntentStore } from '@workspace/client-core/settings/intent-store'

export const useSettingsIntentStore = Object.assign(function useSettingsIntentStore<T>(
  selector: (state: ReturnType<typeof settingsIntentStore.getState>) => T,
) {
  return useStore(settingsIntentStore, selector)
}, settingsIntentStore)
