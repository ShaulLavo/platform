import { createError, defineErrorCatalog, type ErrorOptions, type EvlogError } from 'evlog'

export type StructuredErrorOptions = Omit<ErrorOptions, 'cause'> & {
  cause?: unknown
}

export const serverErrors = defineErrorCatalog('server', {
  INTERNAL_ERROR: {
    status: 500,
    message: ({ message }: { message: string }) => message,
    why: 'A server-side invariant failed while handling internal application state.',
    fix: 'Inspect the server logs and fix the invariant at the throwing call site.',
  },
  LOOPBACK_HOST_REQUIRED: {
    status: 500,
    message: 'FS RPC server must bind to a loopback host',
    why: 'Binding the filesystem RPC server to a non-loopback host can expose local workspace access.',
    fix: 'Configure the server host as localhost, 127.0.0.1, or ::1.',
  },
})

export const orchestrationErrors = defineErrorCatalog('orchestration', {
  COMMAND_PREVIOUSLY_REJECTED: {
    status: 409,
    message: ({ commandId }: { commandId: string }) => `Command previously rejected: ${commandId}`,
    why: 'The command receipt was already marked as rejected.',
    fix: 'Inspect the stored rejection and dispatch a new command when retrying.',
  },
  EVENT_JSON_INVALID: {
    status: 500,
    message: ({ field, sequence }: { field: string; sequence: number }) =>
      `Invalid orchestration event ${field} JSON at sequence ${sequence}`,
    why: 'A persisted orchestration event row contains malformed JSON.',
    fix: 'Inspect the stored orchestration event row and repair or remove the malformed JSON field.',
  },
  PROJECT_ALREADY_EXISTS: {
    status: 409,
    message: ({ projectId }: { projectId: string }) => `Project already exists: ${projectId}`,
    why: 'The project id is already present in the orchestration stream.',
    fix: 'Use a new project id or load the existing project.',
  },
  PROJECT_NOT_FOUND: {
    status: 404,
    message: ({ projectId }: { projectId: string }) => `Project not found: ${projectId}`,
    why: 'The requested project is missing or has been deleted.',
    fix: 'Refresh the orchestration shell and select an existing project.',
  },
  THREAD_ALREADY_EXISTS: {
    status: 409,
    message: ({ threadId }: { threadId: string }) => `Thread already exists: ${threadId}`,
    why: 'The thread id is already present in the orchestration stream.',
    fix: 'Use a new thread id or load the existing thread.',
  },
  THREAD_NOT_FOUND: {
    status: 404,
    message: ({ threadId }: { threadId: string }) => `Thread not found: ${threadId}`,
    why: 'The requested thread is missing or has been deleted.',
    fix: 'Refresh the orchestration shell and select an existing thread.',
  },
})

export const lspErrors = defineErrorCatalog('lsp', {
  PACKAGE_INSTALL_FAILED: {
    status: 500,
    message: ({ packageName }: { packageName: string }) => `Failed to install ${packageName}`,
    why: 'The language server package installer exited with a non-zero status.',
    fix: 'Review the installer output and retry the language server install.',
  },
})

export function createInternalError(message: string, cause?: unknown) {
  return createStructuredError({
    cause,
    code: serverErrors.INTERNAL_ERROR.code,
    fix: serverErrors.INTERNAL_ERROR.fix,
    message,
    status: serverErrors.INTERNAL_ERROR.status,
    why: serverErrors.INTERNAL_ERROR.why,
  })
}

export function createStructuredError(options: StructuredErrorOptions) {
  const { cause, internal, ...rest } = options
  const safeInternal = mergedInternal(internal, cause)

  return createError({
    ...rest,
    ...(cause instanceof Error ? { cause } : {}),
    ...(safeInternal ? { internal: safeInternal } : {}),
  })
}

export function isEvlogError(error: unknown): error is EvlogError {
  return error instanceof Error && error.name === 'EvlogError'
}

function mergedInternal(internal: Record<string, unknown> | undefined, cause: unknown) {
  if (cause === undefined || cause instanceof Error) return internal

  return {
    ...internal,
    cause,
  }
}
