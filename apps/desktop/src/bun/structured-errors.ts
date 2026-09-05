import { createError, defineErrorCatalog, type ErrorOptions } from 'evlog'

type DesktopStructuredErrorOptions = Omit<ErrorOptions, 'cause'> & {
  cause?: unknown
}

const desktopErrors = defineErrorCatalog('desktop', {
  SSH_SETTINGS: {
    status: 400,
    message: 'The SSH machine configuration is invalid.',
    why: 'The desktop launcher could not resolve a valid SSH entry from the primary settings.',
    fix: 'Open Settings → Machines on the local machine and correct the entry.',
  },
  SSH_PROBE: {
    status: 502,
    message: 'The SSH machine could not be reached non-interactively.',
    why: 'SSH refused the connection, or Bun and the server checkout were unavailable.',
    fix: 'Add your key to the agent or configure the host in ~/.ssh/config; verify Bun and the checkout exist.',
  },
  SSH_LAUNCH: {
    status: 502,
    message: 'The remote server could not start.',
    why: 'The remote launcher could not reuse or start the configured server.',
    fix: 'Inspect logs/ssh-launch.log in the remote checkout and verify its dependencies are installed.',
  },
  SSH_FORWARD: {
    status: 502,
    message: 'The SSH port forward is unavailable.',
    why: 'SSH exited or the retained local forwarding port is occupied.',
    fix: 'Restore the SSH connection and free the reported local port, then reconnect the machine.',
  },
  SSH_READINESS: {
    status: 504,
    message: 'The forwarded server did not become ready.',
    why: 'The forwarded /health endpoint did not answer with a valid descriptor.',
    fix: 'Inspect the remote server log and verify SERVER_ALLOWED_ORIGINS includes this desktop web origin.',
  },
  SSH_IDENTITY: {
    status: 409,
    message: 'The SSH machine identity changed.',
    why: 'The forwarded server identity differs from the previously confirmed environment.',
    fix: 'Restore the machine’s original database before reconnecting.',
  },
  SSH_STOP: {
    status: 502,
    message: 'The remote server could not be stopped.',
    why: 'SSH could not remove the launcher record and stop its managed server.',
    fix: 'Reconnect the SSH host and disconnect again, or inspect its .platform-ssh-launch record.',
  },
  INTERNAL_ERROR: {
    status: 500,
    message: ({ message }: { message: string }) => message,
    why: 'A desktop process invariant failed while starting or coordinating Platform.',
    fix: 'Inspect the desktop logs and fix the invariant at the throwing call site.',
  },
})

export type SshErrorStep =
  | 'settings'
  | 'probe'
  | 'launch'
  | 'forward'
  | 'readiness'
  | 'identity'
  | 'stop'

const sshErrors = {
  settings: desktopErrors.SSH_SETTINGS,
  probe: desktopErrors.SSH_PROBE,
  launch: desktopErrors.SSH_LAUNCH,
  forward: desktopErrors.SSH_FORWARD,
  readiness: desktopErrors.SSH_READINESS,
  identity: desktopErrors.SSH_IDENTITY,
  stop: desktopErrors.SSH_STOP,
}

export function createSshError(step: SshErrorStep, detail?: string, cause?: unknown) {
  const definition = sshErrors[step]
  return createDesktopStructuredError({
    code: definition.code,
    status: definition.status,
    why: definition.why,
    fix: definition.fix,
    message: detail ? `${definition.message} ${detail}` : definition.message,
    cause,
  })
}

export function createDesktopError(message: string, cause?: unknown) {
  return createDesktopStructuredError({
    cause,
    code: desktopErrors.INTERNAL_ERROR.code,
    fix: desktopErrors.INTERNAL_ERROR.fix,
    message,
    status: desktopErrors.INTERNAL_ERROR.status,
    why: desktopErrors.INTERNAL_ERROR.why,
  })
}

function createDesktopStructuredError(options: DesktopStructuredErrorOptions) {
  const { cause, ...rest } = options

  return createError({
    ...rest,
    ...(cause instanceof Error ? { cause } : {}),
    ...(cause === undefined || cause instanceof Error ? {} : { internal: { cause } }),
  })
}
