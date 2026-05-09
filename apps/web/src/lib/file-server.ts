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

export function errorMessage(error: unknown) {
  return clientErrorMessage(error)
}

export function rpcErrorMessage(error: unknown) {
  return toClientError(error).message
}
