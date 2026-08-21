import type { SettingsEdit, SettingsSnapshot, SettingsWriteTarget } from '@workspace/contracts'

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

export type SaveSettingsRequest = {
  readonly edits: readonly SettingsEdit[]
  /**
   * The revision the edits were computed against.
   *
   * Load-bearing, not decorative: the collection-valued edits send the whole
   * value built from the cached snapshot, so a hand-edit that landed since that
   * snapshot is overwritten rather than merged. This is what turns that into a
   * refusal the user can see.
   */
  readonly baseRevision?: string
}

/**
 * The server answers with the whole snapshot, so the caller never has to merge
 * its own edits back into the cache — the response is the new truth.
 */
export async function saveSettings({
  baseRevision,
  edits,
}: SaveSettingsRequest): Promise<SettingsSnapshot> {
  return observeClientOperation(
    // Ids only. A settings value can be a provider environment, and this event
    // ends up in a log file the agent itself reads.
    { action: 'settings.write', area: 'settings', settingIds: edits.map((edit) => edit.key) },
    async () => {
      const response = await getClient().settings.write.post({ baseRevision, edits: [...edits] })

      return unwrapEdenResponse(response, {
        requireData: true,
        emptyMessage: 'settings server returned an empty response',
      })
    },
    summarizeSettings,
  )
}

/**
 * Replaces one layer's file wholesale, for the JSON view.
 *
 * `baseRevision` is what makes this safe to offer: the raw write is a
 * whole-document replace, so a buffer seeded before someone else's change would
 * otherwise delete their keys without either side seeing anything. The server
 * refuses a stale one instead.
 */
export async function saveSettingsText({
  baseRevision,
  target,
  text,
}: {
  readonly baseRevision?: string
  readonly target: SettingsWriteTarget
  readonly text: string
}): Promise<SettingsSnapshot> {
  return observeClientOperation(
    // No text and no ids: this request body is the entire settings document, and
    // the log is a file the agent itself reads.
    { action: 'settings.write-raw', area: 'settings' },
    async () => {
      const response = await getClient().settings.raw.post({ baseRevision, target, text })

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
