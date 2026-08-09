import type { Settings, SettingsPatch } from '@workspace/contracts'

import { getClient } from '@/lib/client'
import { observeClientOperation } from '@/lib/client-logging'
import { unwrapEdenResponse } from '@/lib/eden-events'

export async function fetchSettings(signal?: AbortSignal): Promise<Settings> {
  return observeClientOperation(
    { action: 'settings.read', area: 'settings', signal },
    async () => {
      const response = await getClient().settings.get({ fetch: { signal } })

      return unwrapEdenResponse(response, {
        requireData: true,
        emptyMessage: 'settings server returned an empty response',
      })
    },
    summarizeSettings,
  )
}

/**
 * The server answers with the whole document, so the caller never has to merge
 * its own patch back into the cache — the response is the new truth.
 */
export async function saveSettings(patch: SettingsPatch): Promise<Settings> {
  return observeClientOperation(
    { action: 'settings.update', area: 'settings', sections: Object.keys(patch) },
    async () => {
      const response = await getClient().settings.post(patch)

      return unwrapEdenResponse(response, {
        requireData: true,
        emptyMessage: 'settings server returned an empty response',
      })
    },
    summarizeSettings,
  )
}

function summarizeSettings(settings: Settings) {
  return {
    hiddenModelCount: settings.models.hidden.length,
    keybindingOverrideCount: Object.keys(settings.keybindings).length,
    providerInstanceCount: settings.providerInstances.length,
  }
}
