import { toast } from 'sonner'
import type { ErrorCategory } from '@workspace/contracts'
import { reportClientError } from './client-error-reporting'

export type { ErrorCategory }

export type ClientError = {
  readonly category: ErrorCategory
  readonly message: string
  readonly cause?: unknown
}

export const messagesByCategory: Record<ErrorCategory, string> = {
  not_found: 'The requested file or folder could not be found.',
  permission_denied: 'You do not have permission to access that path.',
  not_a_file: 'That path is a directory, not a file.',
  not_a_directory: 'That path is a file, not a directory.',
  too_large: 'The file is larger than the workspace size limit.',
  invalid_path: 'The path is invalid or conflicts with an existing entry.',
  io_error: 'The file server could not complete the filesystem operation.',
  unknown: 'Something went wrong while talking to the file server.',
}

type FsErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN_ORIGIN'
  | 'PATH_OUTSIDE_WORKSPACE'
  | 'GIT_COMMAND_FAILED'
  | 'GIT_REPOSITORY_NOT_FOUND'
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'FILE_CHANGED'
  | 'INVALID_PATH'
  | 'NOT_A_FILE'
  | 'NOT_A_DIRECTORY'
  | 'FILE_TOO_LARGE'
  | 'OPERATION_FAILED'
  | 'WATCH_FAILED'

const categoryByFsErrorCode: Record<FsErrorCode, ErrorCategory> = {
  NOT_FOUND: 'not_found',
  PATH_OUTSIDE_WORKSPACE: 'permission_denied',
  UNAUTHORIZED: 'permission_denied',
  FORBIDDEN_ORIGIN: 'permission_denied',
  NOT_A_FILE: 'not_a_file',
  NOT_A_DIRECTORY: 'not_a_directory',
  FILE_TOO_LARGE: 'too_large',
  INVALID_PATH: 'invalid_path',
  ALREADY_EXISTS: 'invalid_path',
  FILE_CHANGED: 'invalid_path',
  OPERATION_FAILED: 'io_error',
  GIT_COMMAND_FAILED: 'io_error',
  GIT_REPOSITORY_NOT_FOUND: 'io_error',
  WATCH_FAILED: 'io_error',
}

export function toClientError(input: unknown): ClientError {
  if (isAbortError(input)) {
    return {
      category: 'unknown',
      message: messagesByCategory.unknown,
      cause: input,
    }
  }

  const code = extractFsErrorCode(input)
  if (code) {
    const category = categoryByFsErrorCode[code]
    return {
      category,
      message: messagesByCategory[category],
      cause: input,
    }
  }

  return {
    category: 'unknown',
    message: messagesByCategory.unknown,
    cause: input,
  }
}

export function clientErrorMessage(input: unknown): string {
  return toClientError(input).message
}

export function reportError(error: ClientError): void {
  reportClientError({
    area: 'client-error-taxonomy',
    category: error.category,
    cause: error.cause,
    message: error.message,
    operation: 'report',
  })

  if (!shouldToastCategory(error.category)) return

  toast.error(titleByCategory[error.category], {
    description: error.message,
  })
}

const toastableCategories: ReadonlySet<ErrorCategory> = new Set<ErrorCategory>([
  'not_found',
  'permission_denied',
  'too_large',
  'invalid_path',
  'io_error',
])

function shouldToastCategory(category: ErrorCategory): boolean {
  return toastableCategories.has(category)
}

const titleByCategory: Record<ErrorCategory, string> = {
  not_found: 'File not found',
  permission_denied: 'Access denied',
  not_a_file: 'Not a file',
  not_a_directory: 'Not a folder',
  too_large: 'File too large',
  invalid_path: 'Invalid path',
  io_error: 'Filesystem error',
  unknown: 'Unexpected error',
}

function isAbortError(input: unknown): boolean {
  if (input instanceof DOMException) return input.name === 'AbortError'
  if (input instanceof Error && input.name === 'AbortError') return true
  return false
}

function extractFsErrorCode(input: unknown): FsErrorCode | null {
  if (!input || typeof input !== 'object') return null

  if ('value' in input) {
    const code = fsErrorCodeFromErrorContainer((input as { value: unknown }).value)
    if (code) return code
  }

  const direct = fsErrorCodeFromErrorContainer(input)
  if (direct) return direct

  if ('code' in input) {
    const raw = (input as { code: unknown }).code
    if (isFsErrorCode(raw)) return raw
  }

  return null
}

function fsErrorCodeFromErrorContainer(value: unknown): FsErrorCode | null {
  if (!value || typeof value !== 'object') return null
  if (!('error' in value)) return null

  const error = (value as { error: unknown }).error
  if (!error || typeof error !== 'object') return null
  if (!('code' in error)) return null

  const code = (error as { code: unknown }).code
  return isFsErrorCode(code) ? code : null
}

function isFsErrorCode(value: unknown): value is FsErrorCode {
  return typeof value === 'string' && value in categoryByFsErrorCode
}
