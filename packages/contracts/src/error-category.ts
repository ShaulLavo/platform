/**
 * Shared client-error category taxonomy.
 *
 * Defines the eight canonical error categories surfaced by the web
 * app's `Client_Error_Taxonomy`. This module is the single source of
 * truth for the category identifiers so the client and server agree
 * on the codomain of the server → client error mapping documented in
 * design §"Req 7".
 *
 * The values mirror the local union previously duplicated in
 * `apps/web/src/lib/client-error-taxonomy.ts`. Consumers that mapped
 * server `FsErrorCode` values to categories (and any future server
 * surfaces that emit categories directly) can now share this single
 * type instead of re-declaring it.
 *
 * @see Requirements 5.1, 5.2, 5.3, 5.7 and 7.1 of the codebase-review-remediation spec.
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
