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
  WORKSPACE_ROOT_NOT_DIRECTORY: {
    status: 409,
    message: ({ workspaceRoot }: { workspaceRoot: string }) =>
      `Workspace root is not a directory: ${workspaceRoot}`,
    why: 'A file already occupies the path the project would be rooted at.',
    fix: 'Point the project at a directory, or move the file that is in the way.',
  },
  WORKSPACE_ROOT_CREATE_FAILED: {
    status: 500,
    message: ({ workspaceRoot }: { workspaceRoot: string }) =>
      `Workspace root could not be created: ${workspaceRoot}`,
    why: 'The project asked for its workspace root to be created and the filesystem refused.',
    fix: 'Check the parent directory exists and is writable, then dispatch the command again.',
  },
  PROJECT_ALREADY_EXISTS: {
    status: 409,
    message: ({ projectId }: { projectId: string }) => `Project already exists: ${projectId}`,
    why: 'The project id is already present in the orchestration stream.',
    fix: 'Use a new project id or load the existing project.',
  },
  PROJECT_NOT_EMPTY: {
    status: 409,
    message: ({ projectId, threadCount }: { projectId: string; threadCount: number }) =>
      `Project ${projectId} still has ${threadCount} live thread(s)`,
    why: 'Deleting a project cascades to every thread it owns, so it is not a silent operation.',
    fix: 'Delete the threads first, or resend the command with force set to true.',
  },
  PROJECT_NOT_FOUND: {
    status: 404,
    message: ({ projectId }: { projectId: string }) => `Project not found: ${projectId}`,
    why: 'The requested project is missing or has been deleted.',
    fix: 'Refresh the orchestration shell and select an existing project.',
  },
  PROJECT_WORKSPACE_ROOT_TAKEN: {
    status: 409,
    message: ({ projectId, workspaceRoot }: { projectId: string; workspaceRoot: string }) =>
      `Workspace root ${workspaceRoot} already belongs to project ${projectId}`,
    why: 'Two active projects on one workspace root would fight over the same worktrees and checkpoints.',
    fix: 'Open the existing project for this workspace root, or delete it before recreating.',
  },
  THREAD_ALREADY_EXISTS: {
    status: 409,
    message: ({ threadId }: { threadId: string }) => `Thread already exists: ${threadId}`,
    why: 'The thread id is already present in the orchestration stream.',
    fix: 'Use a new thread id or load the existing thread.',
  },
  THREAD_ARCHIVED: {
    status: 409,
    message: ({ commandType, threadId }: { commandType: string; threadId: string }) =>
      `Thread ${threadId} is archived and cannot handle ${commandType}`,
    why: 'An archived thread is parked: accepting work on it would resurrect it invisibly.',
    fix: 'Unarchive the thread before sending this command.',
  },
  THREAD_BRANCH_CONFLICT: {
    status: 409,
    message: ({
      actualBranch,
      expectedBranch,
      threadId,
    }: {
      actualBranch: string | null
      expectedBranch: string | null
      threadId: string
    }) =>
      `Thread ${threadId} is on branch ${actualBranch ?? 'none'}, not the expected ${expectedBranch ?? 'none'}`,
    why: 'The compare-and-swap guard failed: the thread moved branches since the client read it.',
    fix: 'Reload the thread and reissue the update against its current branch.',
  },
  THREAD_NOT_ARCHIVED: {
    status: 409,
    message: ({ threadId }: { threadId: string }) => `Thread is not archived: ${threadId}`,
    why: 'Unarchiving only applies to a thread that is currently archived.',
    fix: 'Refresh the orchestration shell; the thread is already active.',
  },
  THREAD_NOT_FOUND: {
    status: 404,
    message: ({ threadId }: { threadId: string }) => `Thread not found: ${threadId}`,
    why: 'The requested thread is missing or has been deleted.',
    fix: 'Refresh the orchestration shell and select an existing thread.',
  },
})

export const providerErrors = defineErrorCatalog('provider', {
  INSTANCE_NOT_FOUND: {
    status: 404,
    message: ({ providerInstanceId }: { providerInstanceId: string }) =>
      `Provider instance not found: ${providerInstanceId}`,
    why: 'The requested provider instance is not registered in the adapter registry.',
    fix: 'Reload the provider list and address a registered provider instance.',
  },
  LOGIN_ATTEMPT_NOT_FOUND: {
    status: 404,
    message: ({ attemptId }: { attemptId: string }) => `Login attempt not found: ${attemptId}`,
    why: 'The sign-in attempt has been superseded by a newer one or the server restarted.',
    fix: 'Start a new sign-in and poll the attempt id it returns.',
  },
  SIGN_IN_UNSUPPORTED: {
    status: 400,
    message: ({ providerInstanceId }: { providerInstanceId: string }) =>
      `Provider does not support in-app sign-in: ${providerInstanceId}`,
    why: 'The provider adapter does not implement the optional sign-in members.',
    fix: 'Check `supportsSignIn` on the provider snapshot before offering sign-in.',
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
