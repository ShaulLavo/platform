import type { SettingsEdit, SettingsSnapshot } from '@workspace/contracts'

import { getClient } from '@/lib/client'
import { observeClientOperation } from '@/lib/client-logging'
import { unwrapEdenResponse } from '@/lib/eden-events'

export async function fetchSettings(signal?: AbortSignal): Promise<SettingsSnapshot> {
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
 * The server answers with the whole snapshot, so the caller never has to merge
 * its own edits back into the cache — the response is the new truth.
 */
export async function saveSettings(edits: readonly SettingsEdit[]): Promise<SettingsSnapshot> {
  return observeClientOperation(
    // Ids only. A settings value can be a provider environment, and this event
    // ends up in a log file the agent itself reads.
    { action: 'settings.write', area: 'settings', settingIds: edits.map((edit) => edit.key) },
    async () => {
      const response = await getClient().settings.write.post({ edits: [...edits] })

      return unwrapEdenResponse(response, {
        requireData: true,
        emptyMessage: 'settings server returned an empty response',
      })
    },
    summarizeSettings,
  )
}

function summarizeSettings(snapshot: SettingsSnapshot) {
  return {
    diagnosticCount: snapshot.diagnostics.length,
    hiddenModelCount: snapshot.values['models.hidden'].length,
    keybindingOverrideCount: Object.keys(snapshot.values['keybindings.overrides']).length,
    providerInstanceCount: snapshot.values['providers.instances'].length,
  }
}
