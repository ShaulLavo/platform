import { defineErrorCatalog } from 'evlog'

export const sessionIdentityErrors = defineErrorCatalog('provider', {
  SERVICE_CLOSED: {
    status: 503,
    message: 'The provider service is shutting down',
    why: 'A runtime cannot acquire ownership after provider shutdown begins.',
    fix: 'Reconnect after the server restarts.',
  },
  OPERATION_TIMED_OUT: {
    status: 504,
    message: 'The provider operation timed out',
    why: 'The adapter did not finish within its operation timeout.',
    fix: 'Retry cleanup after inspecting the provider process.',
  },
  SESSION_IDENTITY_MISMATCH: {
    status: 409,
    message: 'Claude reported a different session identity',
    why: 'The provider must keep the caller-supplied durable UUID unchanged.',
    fix: 'Stop this runtime and inspect the provider identity before retrying.',
  },
  SESSION_PROVIDER_CONFLICT: {
    status: 409,
    message: 'The session belongs to another provider instance',
    why: 'A durable session cannot switch providers or accounts.',
    fix: 'Create a new session for the other provider instance.',
  },
  DISCOVERY_FAILED: {
    status: 502,
    message: 'Claude session discovery failed',
    why: 'The isolated provider metadata process could not return valid session metadata.',
    fix: 'Inspect the provider instance configuration and retry the scan.',
  },
  HISTORY_FAILED: {
    status: 502,
    message: 'Claude conversation history could not be read',
    why: 'The isolated provider process could not return the local conversation transcript.',
    fix: 'Check that this provider instance can access the session files and retry the import.',
  },
  HISTORY_UNSUPPORTED: {
    status: 400,
    message: 'This provider does not support conversation imports',
    why: 'The configured provider has no local history reader.',
    fix: 'Choose a provider listed in the conversation import settings.',
  },
})
