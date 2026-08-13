import { defineErrorCatalog } from 'evlog'

/**
 * Settings failures the client has to branch on.
 *
 * Each one is a different answer to "why did my save not take": the value was
 * wrong, the key does not exist, the layer may not carry it, the file is broken,
 * someone else edited it, or an administrator owns it. Collapsing them into one
 * generic failure is what makes a settings page feel haunted.
 */
export const settingsErrors = defineErrorCatalog('settings', {
  WRITE_INVALID: {
    status: 400,
    message: ({ key, reason }: { key: string; reason: string }) => `Cannot set ${key}: ${reason}`,
    why: 'The value did not match the setting’s schema, so storing it would have persisted a document the server cannot read back.',
    fix: 'Send a value matching the setting’s declared type. Retrying the same value cannot succeed.',
  },
  UNKNOWN_KEY: {
    status: 400,
    message: ({ key }: { key: string }) => `Unknown setting: ${key}`,
    why: 'The write named a setting this build does not register. Reads keep unknown keys so another build’s settings survive, but a write has to name something real.',
    fix: 'Check the key against the settings registry. A renamed setting keeps its old value in the file until it is removed explicitly.',
  },
  SCOPE_NOT_ALLOWED: {
    status: 400,
    message: ({ key, scope, target }: { key: string; scope: string; target: string }) =>
      `${key} is ${scope}-scoped and cannot be written to ${target} settings`,
    why: 'Workspace settings ship inside a cloned repository, so settings that reach process spawn, exec, env, or the keymap are readable only from the user’s own file.',
    fix: 'Write this setting to user settings instead.',
  },
  FILE_MALFORMED: {
    status: 409,
    message: ({ file, detail }: { file: string; detail: string }) =>
      `Settings file has syntax errors: ${file} (${detail})`,
    why: 'Editing a document the parser could not fully read would compute the edit against a broken tree and corrupt the parts it did understand.',
    fix: 'Fix the JSON syntax in the named file, or delete the file to start from defaults.',
  },
  REVISION_STALE: {
    status: 409,
    message: ({ file }: { file: string }) => `Settings file changed since it was read: ${file}`,
    why: 'The file moved between the read the edit was computed against and the write, so applying it would silently discard whatever landed in between.',
    fix: 'Re-read the settings and apply the change again.',
  },
  POLICY_CONTROLLED: {
    status: 403,
    message: ({ key }: { key: string }) => `${key} is managed by policy and cannot be changed`,
    why: 'A policy layer owns this setting. Accepting the write and then resolving back to the policy value would look like a silent failure.',
    fix: 'Change the policy configuration, or remove the key from it.',
  },
  FILE_PATH_UNSET: {
    status: 500,
    message: () => 'Settings file path was not configured',
    why: 'The settings store was constructed without a file path. Defaulting to the user’s home directory here would let a test run overwrite real settings.',
    fix: 'Pass `settings.userFilePath` to createApp, or set PLATFORM_SETTINGS_FILE.',
  },
})
