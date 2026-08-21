import type { SettingsWriteTarget } from '@workspace/contracts'

export const SETTINGS_JSON_DOCUMENT_PREFIX = 'settings-json:'

const TARGETS: readonly SettingsWriteTarget[] = ['user', 'workspace']

/**
 * The synthetic path a raw settings.json tab carries.
 *
 * One per writable layer rather than the single `settings:` constant the GUI tab
 * uses: the GUI switches layers with a scope tab inside one page, but the text of
 * the user file and the text of the workspace file are two different documents,
 * and a buffer that swapped its own contents when a tab elsewhere changed would
 * be a way to save one file's text over the other's.
 *
 * The payload is a bare target rather than an encoded blob — unlike a path or a
 * git ref there are exactly two of them and neither can contain a separator.
 */
export function settingsJsonDocumentId(target: SettingsWriteTarget): string {
  return `${SETTINGS_JSON_DOCUMENT_PREFIX}${target}`
}

export function parseSettingsJsonDocumentId(
  id: string | null | undefined,
): SettingsWriteTarget | null {
  if (!id?.startsWith(SETTINGS_JSON_DOCUMENT_PREFIX)) return null

  const target = id.slice(SETTINGS_JSON_DOCUMENT_PREFIX.length)

  return TARGETS.find((candidate) => candidate === target) ?? null
}

/**
 * Both layers are called `settings.json` on disk, so the layer has to be in the
 * label or two open tabs are indistinguishable.
 */
export function settingsJsonDocumentLabel(id: string): string {
  const target = parseSettingsJsonDocumentId(id)
  if (!target) return 'settings.json'

  return `settings.json (${target})`
}
