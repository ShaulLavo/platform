import path from 'node:path'
import type { SettingsStoreOptions } from './store'

/**
 * Settings paths pinned inside a test's own temp root.
 *
 * `settingsPaths` refuses to default the user file path, so every `createApp`
 * call site has to say where settings live. That is deliberate: with a file
 * store, a forgotten call site reads and overwrites the developer's real
 * `~/.platform/settings.json`, and this repo keeps no healing code to undo it.
 * This helper is the one answer for tests, so the choice is made once.
 *
 * Watching is off: a test wants deterministic reads, not a debounce racing its
 * assertions.
 */
export function testSettingsOptions(root: string): SettingsStoreOptions {
  return {
    userFilePath: path.join(root, '.platform-test', 'settings.json'),
    secretsFilePath: path.join(root, '.platform-test', 'secrets.json'),
    watch: false,
  }
}
