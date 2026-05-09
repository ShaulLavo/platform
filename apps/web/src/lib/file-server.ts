import { fsClient } from "@/lib/fs-client"
import type { FileResult, TreeResult } from "@/lib/file-system-types"

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
  if (error instanceof Error) return error.message
  return "The file server did not return a usable response."
}

export function rpcErrorMessage(error: unknown) {
  const value = errorValue(error)
  if (isErrorPayload(value)) return value.error.message

  return "The file server rejected the request."
}

function errorValue(error: unknown) {
  if (!error || typeof error !== "object") return null
  if (!("value" in error)) return null

  return error.value
}

function isErrorPayload(
  value: unknown
): value is { error: { message: string } } {
  if (!value || typeof value !== "object") return false
  if (!("error" in value)) return false

  const error = value.error
  if (!error || typeof error !== "object") return false
  return "message" in error && typeof error.message === "string"
}
