import { fsClient } from "@/lib/fs-client"
import type {
  FileResult,
  FindMatch,
  TreeEntry,
  TreeResult,
} from "@/lib/file-system-types"
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

export async function fetchQuickOpenFiles({
  path,
  query,
  signal,
}: {
  path: string
  query: string
  signal: AbortSignal
}) {
  const response = await fsClient.fs.find.get({
    query: {
      caseSensitive: false,
      entryType: "file",
      includeContent: false,
      includeNames: true,
      limit: 200,
      matchMode: "fuzzy",
      path,
      query,
      wholeWord: false,
    },
    fetch: { signal },
  })

  if (response.error) throw new Error(rpcErrorMessage(response.error))

  return (response.data as { matches: FindMatch[] }).matches
}

export async function writeFileContent(
  path: string,
  content: string,
  expectedMtimeMs?: number | null
) {
  const body =
    expectedMtimeMs === undefined || expectedMtimeMs === null
      ? { content, path }
      : { content, expectedMtimeMs, path }
  const response = await fsClient.fs.write.post(body)

  if (response.error) throw new Error(rpcErrorMessage(response.error))

  return response.data as TreeEntry
}

export async function createFileContent(path: string, content: string) {
  const response = await fsClient.fs["create-file"].post({ content, path })

  if (response.error) throw new Error(rpcErrorMessage(response.error))

  return response.data as TreeEntry
}

export async function ensureFolderPath(path: string) {
  if (!path) return null

  const response = await fsClient.fs["create-folder"].post({
    path,
    recursive: true,
  })

  if (response.error) throw new Error(rpcErrorMessage(response.error))

  return response.data as TreeEntry
}

export async function movePath(from: string, to: string) {
  const response = await fsClient.fs.move.post({ from, to })

  if (response.error) throw response.error

  return response.data as TreeEntry
}

export function errorMessage(error: unknown) {
  return clientErrorMessage(error)
}

export function rpcErrorMessage(error: unknown) {
  return toClientError(error).message
}
