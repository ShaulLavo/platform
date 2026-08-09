import type { ProviderEnvironmentVariable } from '../driver'

/**
 * Builds the spawn env for one provider instance: the server's own env first,
 * then the vars the driver derives from its config (`CODEX_HOME`,
 * `CLAUDE_CONFIG_DIR`), then the user's explicit overrides.
 *
 * NEVER isolate an instance by overriding `HOME`: on macOS that relocates the
 * login-keychain lookup and the CLI reports "not logged in" for an account it
 * really has. Each driver exposes its own config-dir knob instead.
 */
export function resolveProviderInstanceEnvironment(input: {
  base?: NodeJS.ProcessEnv
  derived?: readonly ProviderEnvironmentVariable[]
  overrides?: readonly ProviderEnvironmentVariable[]
}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...(input.base ?? process.env) }
  for (const variable of input.derived ?? []) {
    env[variable.name] = variable.value
  }
  for (const variable of input.overrides ?? []) {
    env[variable.name] = variable.value
  }

  return env
}
