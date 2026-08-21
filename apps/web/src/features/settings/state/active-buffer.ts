import { isSettingsDocumentId } from '@/features/settings/utils/document'

import { settingsScope } from './scope-store'
import { settingsView } from './view-store'
import { settingsJsonDocumentId } from '../utils/json-document'

/**
 * The buffer a save should write when the settings tab is selected.
 *
 * The tab is one document (`settings:`) and the text buffers are one per scope,
 * so "what does Mod+S save here" cannot be answered from the tab path alone —
 * it depends on which view is showing and which scope tab is active. Reading the
 * two stores here keeps that question in the feature that owns them rather than
 * in the save path, which has no business knowing the settings page has modes.
 *
 * `null` for the form view: writes there are immediate, so there is nothing to
 * save and the save is a no-op rather than an error.
 */
export function activeSettingsBufferId(path: string | null | undefined): string | null {
  if (!path || !isSettingsDocumentId(path)) return null
  if (settingsView() !== 'json') return null

  return settingsJsonDocumentId(settingsScope())
}
