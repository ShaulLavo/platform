import { getClient } from '@/lib/client'
import type {
  FileResult,
  FindMatch,
  RecentResult,
  ServerInfo,
  StatResult,
  TreeEntry,
  TreeResult,
} from '@/lib/file-system-types'
import { clientErrorMessage } from '@/lib/client-error-taxonomy'
import { observeClientOperation } from '@/lib/client-logging'
import { omitNullish } from '@/lib/objects'
import {
  createRpcError,
  rpcErrorMessage as structuredRpcErrorMessage,
} from '@/lib/structured-errors'
import { collectWorkspaceSearch } from '@/lib/workspace-search-client'
import type { WorkspaceSearchMeasurement } from '@workspace/contracts'

const TREE_LOAD_DEPTH = 1

export type WriteFileContentOptions = {
  baseVersion?: string | null
  expectedMtimeMs?: number | null
  origin?: string | null
  writeId?: string | null
}

export async function fetchTree(path: string, signal: AbortSignal) {
  return observeClientOperation(
    { action: 'fs.tree', area: 'fs', path },
    async () => {
      const response = await getClient().fs.tree.get({
        query: { depth: TREE_LOAD_DEPTH, path },
        fetch: { signal },
      })

      if (response.error) throw createRpcError(response.error)

      return response.data as TreeResult
    },
    (result) => ({ entryCount: result.entries.length }),
  )
}

export async function fetchFile(path: string, signal: AbortSignal) {
  return observeClientOperation(
    { action: 'fs.read', area: 'fs', path },
    async () => {
      const response = await getClient().fs.read.get({
        query: { path },
        fetch: { signal },
      })

      if (response.error) throw createRpcError(response.error)

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
  let measurement: WorkspaceSearchMeasurement | undefined

  return observeClientOperation(
    {
      action: 'fs.quick_open_files',
      area: 'fs',
      path,
      queryLength: query.length,
    },
    async () => {
      const result = await collectWorkspaceSearch(
        {
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
        signal,
      )
      measurement = result.measurement

      return result.matches as FindMatch[]
    },
    (matches) => ({
      matchCount: matches.length,
      providerSources: measurement?.providerSources,
    }),
  )
}

export async function writeFileContent(
  path: string,
  content: string,
  options?: number | null | WriteFileContentOptions,
) {
  const writeOptions = normalizeWriteFileContentOptions(options)
  return observeClientOperation(
    {
      action: 'fs.write',
      area: 'fs',
      hasBaseVersion: writeOptions.baseVersion !== undefined && writeOptions.baseVersion !== null,
      contentBytes: new Blob([content]).size,
      hasExpectedMtime:
        writeOptions.expectedMtimeMs !== undefined && writeOptions.expectedMtimeMs !== null,
      path,
      writeId: writeOptions.writeId ?? undefined,
    },
    async () => {
      const body = writeFileContentBody(path, content, writeOptions)
      const response = await getClient().fs.write.post(body)

      if (response.error) throw createRpcError(response.error)

      return response.data as TreeEntry
    },
    (entry) => ({ entryType: entry.type, size: entry.size }),
  )
}

function normalizeWriteFileContentOptions(
  options: number | null | WriteFileContentOptions | undefined,
): WriteFileContentOptions {
  if (typeof options === 'number' || options === null) {
    return { expectedMtimeMs: options }
  }

  return options ?? {}
}

function writeFileContentBody(path: string, content: string, options: WriteFileContentOptions) {
  return {
    content,
    path,
    ...omitNullish({
      baseVersion: options.baseVersion,
      expectedMtimeMs: options.expectedMtimeMs,
      origin: options.origin,
      writeId: options.writeId,
    }),
  }
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
      const response = await getClient().fs['create-file'].post({ content, path })

      if (response.error) throw createRpcError(response.error)

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
      const response = await getClient().fs['create-folder'].post({
        path,
        recursive: true,
      })

      if (response.error) throw createRpcError(response.error)

      return response.data as TreeEntry
    },
    (entry) => ({ entryType: entry.type }),
  )
}

export async function renamePath(from: string, to: string) {
  return observeClientOperation(
    { action: 'fs.rename', area: 'fs', from, path: to },
    async () => {
      const response = await getClient().fs.rename.post({ from, to })

      if (response.error) throw response.error

      return response.data as TreeEntry
    },
    (entry) => ({ entryType: entry.type, size: entry.size }),
  )
}

export async function fetchServerInfo(signal: AbortSignal) {
  return observeClientOperation(
    { action: 'fs.server_info', area: 'fs' },
    async () => {
      const response = await getClient().health.get({ fetch: { signal } })

      if (response.error) throw createRpcError(response.error)

      return response.data as ServerInfo
    },
    (info) => ({
      homePath: info.homePath,
      workspaceIndexReadiness: info.workspaceIndex?.readiness,
    }),
  )
}

export async function statPath(path: string, signal: AbortSignal) {
  return observeClientOperation(
    { action: 'fs.stat', area: 'fs', path },
    async () => {
      const response = await getClient().fs.stat.get({ query: { path }, fetch: { signal } })

      if (response.error) throw createRpcError(response.error)

      return response.data as StatResult
    },
    (entry) => ({ entryType: entry.type, size: entry.size }),
  )
}

export async function fetchRecentEntries(limit: number, signal: AbortSignal) {
  return observeClientOperation(
    { action: 'fs.recents', area: 'fs', limit },
    async () => {
      const response = await getClient().fs.recents.get({ query: { limit }, fetch: { signal } })

      if (response.error) throw createRpcError(response.error)

      return (response.data as RecentResult).entries
    },
    (entries) => ({ entryCount: entries.length }),
  )
}

export async function recordRecentEntry(path: string) {
  return observeClientOperation({ action: 'fs.record_recent', area: 'fs', path }, async () => {
    const response = await getClient().fs.recents.post({ path })

    if (response.error) throw createRpcError(response.error)

    return null
  })
}

export function errorMessage(error: unknown) {
  return clientErrorMessage(error)
}

export function rpcErrorMessage(error: unknown) {
  return structuredRpcErrorMessage(error)
}
