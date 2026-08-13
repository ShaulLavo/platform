import path from 'node:path'
import { platformHomePath } from '../home'
import { settingsErrors } from './structured-errors'

/** The per-repository directory a workspace settings file lives in. */
const WORKSPACE_SETTINGS_DIRECTORY = '.platform'

export type SettingsPathOptions = {
  /** Explicit path, or `PLATFORM_SETTINGS_FILE`. Never defaulted silently — see below. */
  readonly userFilePath?: string
  readonly secretsFilePath?: string
  /** The server's own workspace root. Never a client-supplied value. */
  readonly workspaceRoot?: string | null
}

export type SettingsPaths = {
  readonly user: string
  readonly secrets: string
  readonly workspace: string | null
}

/**
 * Where each layer's file lives.
 *
 * The user path has **no default**. Falling back to `~/.platform/settings.json`
 * would mean any `createApp` call site that forgot to thread the option — there
 * are fifteen — silently reads and overwrites the developer's real settings
 * during a test run, and the repo keeps no healing code to undo that. Failing
 * loudly at construction is the only version of this that stays safe.
 *
 * The workspace path is derived from the server's own workspace root, never from
 * a request parameter. That is why there is no confinement check here: a value a
 * client cannot supply cannot escape.
 */
export function settingsPaths(options: SettingsPathOptions): SettingsPaths {
  const user = options.userFilePath?.trim()
  if (!user) throw settingsErrors.FILE_PATH_UNSET({})

  return {
    user,
    secrets: options.secretsFilePath?.trim() || defaultSecretsPath(user),
    workspace: workspaceSettingsPath(options.workspaceRoot),
  }
}

function workspaceSettingsPath(workspaceRoot: string | null | undefined): string | null {
  if (!workspaceRoot) return null

  return path.join(workspaceRoot, WORKSPACE_SETTINGS_DIRECTORY, 'settings.json')
}

/**
 * Secrets sit beside the settings file rather than at a fixed home path, so a
 * test that redirects one redirects both. Forgetting the second option would
 * otherwise leave tests writing real secrets next to a temp settings file.
 */
function defaultSecretsPath(userFilePath: string): string {
  return path.join(path.dirname(userFilePath), 'secrets.json')
}

/** The production locations, used by `apps/server/src/index.ts` and the desktop shell. */
export function defaultSettingsFilePath(): string {
  return platformHomePath('settings.json')
}

export function defaultSecretsFilePath(): string {
  return platformHomePath('secrets.json')
}
