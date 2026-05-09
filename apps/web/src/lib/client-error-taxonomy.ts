/**
 * Client_Error_Taxonomy — the Web_App mirror of the server's FsError taxonomy.
 *
 * Exports the eight canonical error categories, a structural `ClientError`
 * type, a layered input-to-category mapper, a category-derived human message
 * helper, and a `reportError` sink that toasts critical categories and
 * always logs.
 *
 * Codebase-review-remediation spec: Requirements 7.1, 7.2, 7.3, 7.4, 7.6.
 *
 * TODO(spec:codebase-review-remediation task 3.1): `ErrorCategory` will move
 * to `@workspace/contracts` (shared with the server's FsError code table).
 * Once task 3.1 populates that package, replace the local declaration below
 * with `export type { ErrorCategory } from "@workspace/contracts"` and keep
 * the rest of this module unchanged.
 */

import { toast } from "sonner"

// ---------------------------------------------------------------------------
// Category taxonomy
// ---------------------------------------------------------------------------

/**
 * The eight client-side error categories. Mirrors the server's FsError codes
 * through the mapping table in {@link toClientError}; the `unknown` category
 * is the catch-all per Req 7.3.
 */
export type ErrorCategory =
  | "not_found"
  | "permission_denied"
  | "not_a_file"
  | "not_a_directory"
  | "too_large"
  | "invalid_path"
  | "io_error"
  | "unknown"

export type ClientError = {
  readonly category: ErrorCategory
  readonly message: string
  readonly cause?: unknown
}

/**
 * Human-readable message per category. Each message is distinct (Req 7.4):
 * no two categories share the same string.
 */
export const messagesByCategory: Record<ErrorCategory, string> = {
  not_found: "The requested file or folder could not be found.",
  permission_denied: "You do not have permission to access that path.",
  not_a_file: "That path is a directory, not a file.",
  not_a_directory: "That path is a file, not a directory.",
  too_large: "The file is larger than the workspace size limit.",
  invalid_path: "The path is invalid or conflicts with an existing entry.",
  io_error: "The file server could not complete the filesystem operation.",
  unknown: "Something went wrong while talking to the file server.",
}

// ---------------------------------------------------------------------------
// FsErrorCode → ErrorCategory mapping
// ---------------------------------------------------------------------------

/**
 * The server's full FsErrorCode taxonomy. Kept as a local literal union so
 * this module does not need to import from `apps/server`. Any new server
 * code must be added here and to {@link categoryByFsErrorCode} below.
 *
 * Source of truth: `apps/server/src/fs/errors.ts`.
 */
type FsErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN_ORIGIN"
  | "PATH_OUTSIDE_WORKSPACE"
  | "GIT_COMMAND_FAILED"
  | "GIT_REPOSITORY_NOT_FOUND"
  | "NOT_FOUND"
  | "ALREADY_EXISTS"
  | "FILE_CHANGED"
  | "INVALID_PATH"
  | "NOT_A_FILE"
  | "NOT_A_DIRECTORY"
  | "FILE_TOO_LARGE"
  | "OPERATION_FAILED"

const categoryByFsErrorCode: Record<FsErrorCode, ErrorCategory> = {
  NOT_FOUND: "not_found",
  PATH_OUTSIDE_WORKSPACE: "permission_denied",
  UNAUTHORIZED: "permission_denied",
  FORBIDDEN_ORIGIN: "permission_denied",
  NOT_A_FILE: "not_a_file",
  NOT_A_DIRECTORY: "not_a_directory",
  FILE_TOO_LARGE: "too_large",
  INVALID_PATH: "invalid_path",
  ALREADY_EXISTS: "invalid_path",
  FILE_CHANGED: "invalid_path",
  OPERATION_FAILED: "io_error",
  GIT_COMMAND_FAILED: "io_error",
  GIT_REPOSITORY_NOT_FOUND: "io_error",
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Map any incoming error value to a {@link ClientError}. Total over
 * `unknown`: never throws, always returns one of the eight categories
 * (Req 7.2, 7.3).
 *
 * Recognition is layered:
 *   1. Eden RPC error payloads carrying `{ value: { error: { code } } }`.
 *   2. Plain objects with a top-level string `code` (direct server
 *      responses or rethrown payloads).
 *   3. `DOMException` with name `"AbortError"` → `unknown`. Surface-policy
 *      filtering in {@link reportError} skips toasts for this case
 *      (Req 7 "AbortError passthrough").
 *   4. Otherwise → `unknown`.
 */
export function toClientError(input: unknown): ClientError {
  if (isAbortError(input)) {
    return {
      category: "unknown",
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
    category: "unknown",
    message: messagesByCategory.unknown,
    cause: input,
  }
}

/**
 * Derive a human-readable message from `input`. Output is drawn exclusively
 * from {@link messagesByCategory} per the mapped category (Req 7.4), so
 * messages never leak raw server strings into the UI.
 */
export function errorMessage(input: unknown): string {
  return toClientError(input).message
}

/**
 * Surface an error. Always logs via `console.error`; additionally emits a
 * `sonner` toast for the five user-actionable categories (Req 7.6). Aborts
 * routed through `unknown` remain silent.
 */
export function reportError(error: ClientError): void {
  // Always log. `apps/web` has no dedicated structured logger today, so
  // `console.error` preserves the existing behavior at every current call
  // site (`use-workspace-events.ts`, `file-server.ts`, etc.).
  console.error("[client-error-taxonomy]", {
    category: error.category,
    message: error.message,
    cause: error.cause,
  })

  if (!shouldToastCategory(error.category)) return

  toast.error(titleByCategory[error.category], {
    description: error.message,
  })
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const toastableCategories: ReadonlySet<ErrorCategory> = new Set<ErrorCategory>([
  "not_found",
  "permission_denied",
  "too_large",
  "invalid_path",
  "io_error",
])

function shouldToastCategory(category: ErrorCategory): boolean {
  return toastableCategories.has(category)
}

const titleByCategory: Record<ErrorCategory, string> = {
  not_found: "File not found",
  permission_denied: "Access denied",
  not_a_file: "Not a file",
  not_a_directory: "Not a folder",
  too_large: "File too large",
  invalid_path: "Invalid path",
  io_error: "Filesystem error",
  unknown: "Unexpected error",
}

function isAbortError(input: unknown): boolean {
  if (input instanceof DOMException) return input.name === "AbortError"
  if (input instanceof Error && input.name === "AbortError") return true
  return false
}

function extractFsErrorCode(input: unknown): FsErrorCode | null {
  if (!input || typeof input !== "object") return null

  // Eden / RPC envelope: `{ value: { error: { code, message } } }`.
  if ("value" in input) {
    const code = fsErrorCodeFromErrorContainer(
      (input as { value: unknown }).value
    )
    if (code) return code
  }

  // Direct `{ error: { code } }` payload (e.g. rethrown server response).
  const direct = fsErrorCodeFromErrorContainer(input)
  if (direct) return direct

  // Flat `{ code: "..." }` payload.
  if ("code" in input) {
    const raw = (input as { code: unknown }).code
    if (isFsErrorCode(raw)) return raw
  }

  return null
}

function fsErrorCodeFromErrorContainer(value: unknown): FsErrorCode | null {
  if (!value || typeof value !== "object") return null
  if (!("error" in value)) return null

  const error = (value as { error: unknown }).error
  if (!error || typeof error !== "object") return null
  if (!("code" in error)) return null

  const code = (error as { code: unknown }).code
  return isFsErrorCode(code) ? code : null
}

function isFsErrorCode(value: unknown): value is FsErrorCode {
  return typeof value === "string" && value in categoryByFsErrorCode
}
