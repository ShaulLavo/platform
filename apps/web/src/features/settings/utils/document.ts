const SETTINGS_DOCUMENT_ID = 'settings:'

/**
 * The synthetic path a Settings tab carries.
 *
 * Follows the `search-buffer:` convention, which buys two things for free: the
 * workbench dedupes editor tabs by path, so the tab is a singleton without any
 * extra bookkeeping, and `pathForWorkspace` drops it, so a Settings tab is not
 * restored on reload the way a file is.
 *
 * A constant rather than a function: there is exactly one settings document, and
 * a per-workspace one would give the same file two tabs.
 */
export function settingsDocumentId(): string {
  return SETTINGS_DOCUMENT_ID
}

export function isSettingsDocumentId(path: string): boolean {
  return path === SETTINGS_DOCUMENT_ID
}
