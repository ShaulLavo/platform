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
import { log, observeClientOperation } from '@/lib/client-logging'
import { createCoalescedLogQueue } from '@/lib/coalesced-log'
import { omitNullish } from '@/lib/objects'
import {
  createRpcError,
  rpcErrorMessage as structuredRpcErrorMessage,
} from '@/lib/structured-errors'
import { collectWorkspaceSearch } from '@/lib/workspace-search-client'
import type { WorkspaceSearchMeasurement } from '@workspace/contracts'

const TREE_LOAD_DEPTH = 1
const TREE_LOG_DELAY_MS = 250
const treeLogs = createCoalescedLogQueue({
  delayMs: TREE_LOG_DELAY_MS,
  emit: (event) => log.info(event),
  merge: mergeTreeLogEvents,
})
const READ_LOG_DELAY_MS = 250
const readLogs = createCoalescedLogQueue({
  delayMs: READ_LOG_DELAY_MS,
  emit: (event) => log.info(event),
})

export type WriteFileContentOptions = {
  baseVersion?: string | null
  expectedMtimeMs?: number | null
  origin?: string | null
  writeId?: string | null
}

export async function fetchTree(path: string, signal: AbortSignal) {
  const startedAt = performance.now()

  try {
    const response = await getClient().fs.tree.get({
      query: { depth: TREE_LOAD_DEPTH, path },
      fetch: { signal },
    })

    if (response.error) throw createRpcError(response.error)

    const result = response.data as TreeResult
    queueTreeSuccessLog(path, result, startedAt)
    return result
  } catch (error) {
    logTreeError(path, error, startedAt, signal)
    throw error
  }
}

export async function fetchFile(path: string, signal: AbortSignal) {
  const startedAt = performance.now()

  try {
    const response = await getClient().fs.read.get({
      query: { path },
      fetch: { signal },
    })

    if (response.error) throw createRpcError(response.error)

    const result = response.data as FileResult
    queueReadSuccessLog(path, result, startedAt)
    return result
  } catch (error) {
    logReadError(path, error, startedAt, signal)
    throw error
  }
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
    { action: 'fs.server_info', area: 'fs', signal },
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
    { action: 'fs.stat', area: 'fs', path, signal },
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
    { action: 'fs.recents', area: 'fs', limit, signal },
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

function queueTreeSuccessLog(path: string, result: TreeResult, startedAt: number) {
  treeLogs.queue('fs.tree', {
    action: 'fs.tree',
    area: 'fs',
    durationMs: elapsedMs(startedAt),
    entryCount: result.entries.length,
    outcome: 'ok',
    path,
  })
}

function queueReadSuccessLog(path: string, result: FileResult, startedAt: number) {
  readLogs.queue(`fs.read:${path}`, {
    action: 'fs.read',
    area: 'fs',
    durationMs: elapsedMs(startedAt),
    outcome: 'ok',
    path,
    size: result.size,
  })
}

function logReadError(path: string, error: unknown, startedAt: number, signal: AbortSignal) {
  if (signal.aborted) return
  if (isAbortError(error)) return

  log.warn({
    action: 'fs.read',
    area: 'fs',
    durationMs: elapsedMs(startedAt),
    error: operationErrorSummary(error),
    outcome: 'error',
    path,
  })
}

function logTreeError(path: string, error: unknown, startedAt: number, signal: AbortSignal) {
  if (signal.aborted) return
  if (isAbortError(error)) return

  log.warn({
    action: 'fs.tree',
    area: 'fs',
    durationMs: elapsedMs(startedAt),
    error: operationErrorSummary(error),
    outcome: 'error',
    path,
  })
}

function mergeTreeLogEvents(current: Record<string, unknown>, next: Record<string, unknown>) {
  return {
    action: 'fs.tree',
    area: 'fs',
    latestPath: stringField(next, 'path') ?? stringField(next, 'latestPath'),
    maxDurationMs: Math.max(
      numberField(current, 'maxDurationMs'),
      durationMs(current),
      durationMs(next),
    ),
    outcome: 'ok',
    pathCount: numberField(current, 'pathCount', 1) + 1,
    pathSample: treePathSample(current, next),
    totalDurationMs: roundMs(totalDurationMs(current) + durationMs(next)),
    totalEntryCount: totalEntryCount(current) + entryCount(next),
  }
}

function treePathSample(current: Record<string, unknown>, next: Record<string, unknown>) {
  const paths = currentPathSample(current)
  const nextPath = stringField(next, 'path') ?? stringField(next, 'latestPath')
  if (nextPath) paths.push(nextPath)

  return paths.slice(0, 3)
}

function currentPathSample(event: Record<string, unknown>) {
  if (Array.isArray(event.pathSample)) {
    return event.pathSample.filter((value): value is string => typeof value === 'string')
  }

  const path = stringField(event, 'path') ?? stringField(event, 'latestPath')
  return path ? [path] : []
}

function operationErrorSummary(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
    }
  }

  return {
    message: String(error),
    name: typeof error,
  }
}

function isAbortError(error: unknown) {
  if (error instanceof DOMException) return error.name === 'AbortError'
  if (error instanceof Error) return error.name === 'AbortError'

  return false
}

function totalDurationMs(event: Record<string, unknown>) {
  return numberField(event, 'totalDurationMs', durationMs(event))
}

function totalEntryCount(event: Record<string, unknown>) {
  return numberField(event, 'totalEntryCount', entryCount(event))
}

function durationMs(event: Record<string, unknown>) {
  return numberField(event, 'durationMs')
}

function entryCount(event: Record<string, unknown>) {
  return numberField(event, 'entryCount')
}

function numberField(event: Record<string, unknown>, key: string, fallback = 0) {
  const value = event[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function stringField(event: Record<string, unknown>, key: string) {
  const value = event[key]
  return typeof value === 'string' ? value : null
}

function elapsedMs(startedAt: number) {
  return roundMs(performance.now() - startedAt)
}

function roundMs(value: number) {
  return Math.round(value * 100) / 100
}
