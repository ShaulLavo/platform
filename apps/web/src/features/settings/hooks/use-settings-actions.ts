import {
  DEFAULT_SETTING_VALUES,
  SETTING_IDS,
  type ModelRef,
  type ProviderInstanceConfig,
  type SettingId,
  type SettingsSnapshot,
  type SettingsValues,
  type SettingsWriteTarget,
} from '@workspace/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { PlatformCommandId } from '@/keymap/types'

import { providerQueryKeys } from '@/features/chat/lib/provider-query'

import { saveSettings } from '../api'
import { notifySaveError } from '../notify-save-error'
import { settingsKeys } from '../query-keys'
import {
  withMovedModel,
  withKeybindingOverride,
  withModelHidden,
  withoutKeybindingOverride,
  withProviderEnabled,
} from '../utils/patch'

/**
 * Domain actions over the settings document. Rows call this directly instead of
 * receiving callbacks, so a toggle deep in the panel never has to be threaded
 * down from whoever owns the query.
 */
export function useSettingsActions() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: saveSettings,
    onError: notifySaveError,
    // The response is the whole snapshot, so it replaces the cache outright
    // instead of invalidating and paying for a second round trip.
    onSuccess: (snapshot) => {
      queryClient.setQueryData(settingsKeys.document(), snapshot)
      // The composer's provider list is cached for 60s, so without this a
      // provider disabled here stays in the picker for up to a minute — the
      // server reconciles immediately and the UI disagrees with it.
      void queryClient.invalidateQueries({ queryKey: providerQueryKeys.all })
    },
  })

  const values = () =>
    queryClient.getQueryData<SettingsSnapshot>(settingsKeys.document())?.values ??
    DEFAULT_SETTING_VALUES

  const setSetting = <K extends SettingId>(
    key: K,
    value: SettingsValues[K],
    target: SettingsWriteTarget = 'user',
  ) => {
    mutation.mutate([{ key, target, value }])
  }

  return {
    isSaving: mutation.isPending,
    /** The one write path. Commands and the page both go through it, so the
     * keyboard and the settings UI can never disagree about a value. */
    setSetting,
    setColorTheme: (theme: SettingsValues['workbench.colorTheme']) =>
      setSetting('workbench.colorTheme', theme),
    /** Omitting the value is what removes the key from the file entirely, which
     * is what keeps the registry default live rather than freezing today's. */
    resetSetting: (key: SettingId, target: SettingsWriteTarget = 'user') => {
      mutation.mutate([{ key, target }])
    },
    /**
     * Clears every key from one layer in a single write.
     *
     * One request rather than a loop: the store applies all edits to the file in
     * one pass, so a half-reset cannot survive a failure partway through.
     */
    resetAll: (target: SettingsWriteTarget = 'user') => {
      mutation.mutate(SETTING_IDS.map((key) => ({ key, target })))
    },
    resetKeybinding: (command: PlatformCommandId) => {
      mutation.mutate([
        {
          key: 'keybindings.overrides',
          target: 'user',
          value: withoutKeybindingOverride(values()['keybindings.overrides'], command),
        },
      ])
    },
    /** `null` unbinds the command; resetting is what restores its default. */
    setKeybinding: (command: PlatformCommandId, keys: string | null) => {
      mutation.mutate([
        {
          key: 'keybindings.overrides',
          target: 'user',
          value: withKeybindingOverride(values()['keybindings.overrides'], command, keys),
        },
      ])
    },
    /**
     * Moves a model within the explicit leading order.
     *
     * A model with no rank yet is appended before being moved, because `order`
     * is sparse: it names only the models the user has an opinion about, so
     * "move this up" first has to make it one of them.
     */
    moveModel: (ref: ModelRef, direction: -1 | 1) => {
      mutation.mutate([
        {
          key: 'models.order',
          target: 'user',
          value: withMovedModel(values()['models.order'], ref, direction),
        },
      ])
    },
    setModelHidden: (ref: ModelRef, hidden: boolean) => {
      mutation.mutate([
        {
          key: 'models.hidden',
          target: 'user',
          value: withModelHidden(values()['models.hidden'], ref, hidden),
        },
      ])
    },
    // Takes the whole instance, not just its id: a built-in the settings
    // document has never mentioned has to be appended, and only the caller
    // knows what its configuration is.
    setProviderEnabled: (instance: ProviderInstanceConfig, enabled: boolean) => {
      mutation.mutate([
        {
          key: 'providers.instances',
          target: 'user',
          value: withProviderEnabled(values()['providers.instances'], instance, enabled),
        },
      ])
    },
  }
}
