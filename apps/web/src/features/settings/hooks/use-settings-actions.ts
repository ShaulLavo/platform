import {
  DEFAULT_SETTINGS,
  type ModelRef,
  type ProviderInstanceId,
  type Settings,
} from '@workspace/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { saveSettings } from '../api'
import { notifySaveError } from '../notify-save-error'
import { settingsKeys } from '../query-keys'
import { withModelHidden, withProviderEnabled } from '../utils/patch'

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
    // The response is the whole document, so it replaces the cache outright
    // instead of invalidating and paying for a second round trip.
    onSuccess: (settings) => queryClient.setQueryData(settingsKeys.document(), settings),
  })

  const current = () =>
    queryClient.getQueryData<Settings>(settingsKeys.document()) ?? DEFAULT_SETTINGS

  return {
    isSaving: mutation.isPending,
    setModelHidden: (ref: ModelRef, hidden: boolean) => {
      mutation.mutate({ models: withModelHidden(current().models, ref, hidden) })
    },
    setProviderEnabled: (providerInstanceId: ProviderInstanceId, enabled: boolean) => {
      mutation.mutate({
        providerInstances: withProviderEnabled(
          current().providerInstances,
          providerInstanceId,
          enabled,
        ),
      })
    },
  }
}
