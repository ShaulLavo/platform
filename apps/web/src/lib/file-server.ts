import { client } from '@/lib/client'
import type { FileResult, FindMatch, TreeEntry, TreeResult } from '@/lib/file-system-types'
import { errorMessage as clientErrorMessage, toClientError } from '@/lib/client-error-taxonomy'
import { observeClientOperation } from '@/lib/client-logging'

const TREE_LOAD_DEPTH = 1

export async function fetchTree(path: string, signal: AbortSignal) {
  return observeClientOperation(
    { action: 'fs.tree', area: 'fs', path },
    async () => {
      const response = await client.fs.tree.get({
        query: { depth: TREE_LOAD_DEPTH, path },
        fetch: { signal },
      })

      if (response.error) throw new Error(rpcErrorMessage(response.error))

      return response.data as TreeResult
    },
    (result) => ({ entryCount: result.entries.length }),
  )
}

export async function fetchFile(path: string, signal: AbortSignal) {
  return observeClientOperation(
    { action: 'fs.read', area: 'fs', path },
    async () => {
      const response = await client.fs.read.get({
        query: { path },
        fetch: { signal },
      })

      if (response.error) throw new Error(rpcErrorMessage(response.error))

      return response.data as FileResult
    },
    (result) => ({ size: result.size }),
  )
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
  return observeClientOperation(
    {
      action: 'fs.quick_open_files',
      area: 'fs',
      path,
      queryLength: query.length,
    },
    async () => {
      const response = await client.fs.find.get({
        query: {
          caseSensitive: false,
          entryType: 'file',
          includeContent: false,
          includeNames: true,
          limit: 200,
          matchMode: 'fuzzy',
          path,
          query,
          wholeWord: false,
        },
        fetch: { signal },
      })

      if (response.error) throw new Error(rpcErrorMessage(response.error))

      return (response.data as { matches: FindMatch[] }).matches
    },
    (matches) => ({ matchCount: matches.length }),
  )
}

export async function writeFileContent(
  path: string,
  content: string,
  expectedMtimeMs?: number | null,
) {
  return observeClientOperation(
    {
      action: 'fs.write',
      area: 'fs',
      contentBytes: new Blob([content]).size,
      hasExpectedMtime: expectedMtimeMs !== undefined && expectedMtimeMs !== null,
      path,
    },
    async () => {
      const body =
        expectedMtimeMs === undefined || expectedMtimeMs === null
          ? { content, path }
          : { content, expectedMtimeMs, path }
      const response = await client.fs.write.post(body)

      if (response.error) throw new Error(rpcErrorMessage(response.error))

      return response.data as TreeEntry
    },
    (entry) => ({ entryType: entry.type, size: entry.size }),
  )
}

export async function createFileContent(path: string, content: string) {
  return observeClientOperation(
    {
      action: 'fs.create_file',
      area: 'fs',
      contentBytes: new Blob([content]).size,
      path,
    },
    async () => {
      const response = await client.fs['create-file'].post({ content, path })

      if (response.error) throw new Error(rpcErrorMessage(response.error))

      return response.data as TreeEntry
    },
    (entry) => ({ entryType: entry.type, size: entry.size }),
  )
}

export async function ensureFolderPath(path: string) {
  if (!path) return null

  return observeClientOperation(
    { action: 'fs.create_folder', area: 'fs', path, recursive: true },
    async () => {
      const response = await client.fs['create-folder'].post({
        path,
        recursive: true,
      })

      if (response.error) throw new Error(rpcErrorMessage(response.error))

      return response.data as TreeEntry
    },
    (entry) => ({ entryType: entry.type }),
  )
}

export async function movePath(from: string, to: string) {
  return observeClientOperation(
    { action: 'fs.move', area: 'fs', from, path: to },
    async () => {
      const response = await client.fs.move.post({ from, to })

      if (response.error) throw response.error

      return response.data as TreeEntry
    },
    (entry) => ({ entryType: entry.type, size: entry.size }),
  )
}

export function errorMessage(error: unknown) {
  return clientErrorMessage(error)
}

export function rpcErrorMessage(error: unknown) {
  return toClientError(error).message
}
