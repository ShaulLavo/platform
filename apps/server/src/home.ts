import { homedir } from 'node:os'
import path from 'node:path'

const PLATFORM_HOME_DIRECTORY = '.platform'

/**
 * Every path under the app's home directory, resolved in one place.
 *
 * Local state used to be split across `~/.platform` (fonts, language servers)
 * and `~/.platform-file-picker` (database, attachments, provider status), for no
 * reason anybody recorded — six independent `path.join(homedir(), …)` calls is
 * how a split like that happens. One helper is what stops it happening again,
 * and it is why the settings file could be added without becoming a third
 * convention.
 */
export function platformHomePath(...segments: string[]): string {
  return path.join(homedir(), PLATFORM_HOME_DIRECTORY, ...segments)
}
