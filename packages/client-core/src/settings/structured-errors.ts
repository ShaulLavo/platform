import { createClientError } from '../errors'

export function settingsInvariantError(message: string) {
  return createClientError({
    code: 'client.SETTINGS_INVARIANT',
    status: 500,
    message,
    why: 'The settings owner could not establish confirmed state.',
    fix: 'Reconnect and reload the confirmed settings document.',
  })
}
