import { isRecord } from "@workspace/contracts"
import type * as lsp from "vscode-languageserver-protocol"

/**
 * JSON-RPC 2.0 reserved error code for an internal server error (`-32603`).
 *
 * Exported as a named constant so callers do not repeat the magic number, and
 * so future relocations (e.g. centralizing JSON-RPC reserved codes in
 * `@workspace/contracts`) can change a single value (Req 6.5, Req 8.7).
 *
 * The value matches `ErrorCodes.InternalError` from `vscode-jsonrpc`; we
 * inline the literal because the project imports `vscode-languageserver-protocol`
 * with `import type * as lsp` and therefore cannot reference the enum as a
 * runtime value without a new non-type import.
 */
export const JSON_RPC_INTERNAL_ERROR = -32603

/**
 * JSON-RPC 2.0 error-object shape as carried on the wire in a
 * `{ jsonrpc, id, error }` response message. Structurally equivalent to
 * `ResponseErrorLiteral` from `vscode-jsonrpc`; declared locally so the
 * module keeps its type-only dependency on `vscode-languageserver-protocol`.
 */
export type JsonRpcError = {
  code: number
  message: string
  data?: unknown
}

/**
 * Narrowing guard for a value that already has the JSON-RPC error shape.
 *
 * Handlers are permitted to `throw` a pre-built `JsonRpcError` to propagate a
 * specific code (e.g. `INVALID_PARAMS = -32602`, `METHOD_NOT_FOUND = -32601`)
 * through session dispatch; in that case {@link toResponseError} forwards the
 * literal unchanged instead of coercing it to `INTERNAL_ERROR`.
 */
export function isJsonRpcError(error: unknown): error is JsonRpcError {
  if (!isRecord(error)) return false
  return typeof error.code === "number" && typeof error.message === "string"
}

/**
 * Extracts a human-readable message string from an unknown thrown value.
 *
 * - `Error` instances contribute their `message`.
 * - Plain string throws are returned verbatim.
 * - Everything else falls back to a stable, non-leaking placeholder so stray
 *   object payloads do not end up JSON-stringified into the response message.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  return "TypeScript LSP operation failed"
}

/**
 * Converts a thrown `unknown` into a protocol-compliant JSON-RPC error object
 * for inclusion in the `error` field of a response message (Req 6.5).
 *
 * This function is pure: it reads the input and produces a new `JsonRpcError`.
 * It must not mutate any shared session state — callers (e.g. `session.ts`
 * dispatch) rely on that purity to guarantee that an error path during one
 * request cannot corrupt state observed by subsequent requests on the same
 * session.
 */
export function toResponseError(error: unknown): JsonRpcError {
  if (isJsonRpcError(error)) return error
  return { code: JSON_RPC_INTERNAL_ERROR, message: errorMessage(error) }
}

/**
 * Convenience helper for the `session.ts` dispatch `try / catch` block: given
 * the session's error-posting function and the originating request id, wraps
 * the thrown value in a `JsonRpcError` and forwards it via `post`.
 *
 * Keeping the `post` function as a parameter (rather than importing a
 * transport) preserves the pure, stateless nature of this module and lets the
 * session own all I/O.
 */
export function respondWithError(
  post: (id: lsp.RequestMessage["id"] | null, error: JsonRpcError) => void,
  id: lsp.RequestMessage["id"] | null,
  error: unknown,
): void {
  post(id, toResponseError(error))
}
