import { fsClient } from "@/lib/fs-client"
import type { FileResult, TreeResult } from "@/lib/file-system-types"
import {
  errorMessage as clientErrorMessage,
  toClientError,
} from "@/lib/client-error-taxonomy"

const TREE_LOAD_DEPTH = 1

export async function fetchTree(path: string, signal: AbortSignal) {
  const response = await fsClient.fs.tree.get({
    query: { depth: TREE_LOAD_DEPTH, path },
    fetch: { signal },
  })

  if (response.error) throw new Error(rpcErrorMessage(response.error))

  return response.data as TreeResult
}

export async function fetchFile(path: string, signal: AbortSignal) {
  const response = await fsClient.fs.read.get({
    query: { path },
    fetch: { signal },
  })

  if (response.error) throw new Error(rpcErrorMessage(response.error))

  return response.data as FileResult
}

/**
 * Derive a human-readable error message for UI surfaces.
 *
 * Delegates to the Client_Error_Taxonomy (Req 7.4) so the message is drawn
 * from the mapped category and stays consistent with `rpcErrorMessage` and
 * `reportError`. Kept as a named export to preserve the existing
 * `@/lib/file-server` import path across the Web_App.
 */
export function errorMessage(error: unknown) {
  return clientErrorMessage(error)
}

/**
 * Derive a human-readable error message from an Eden RPC error payload.
 *
 * Routes the RPC envelope through the Client_Error_Taxonomy (Req 7.2, 7.4)
 * so the resulting message is category-derived and shared across every
 * `@/lib/file-server` consumer. The legacy envelope-unwrapping logic was
 * collapsed into `toClientError`, which recognizes the Eden
 * `{ value: { error: { code, message } } }` shape directly.
 */
export function rpcErrorMessage(error: unknown) {
  return toClientError(error).message
}
