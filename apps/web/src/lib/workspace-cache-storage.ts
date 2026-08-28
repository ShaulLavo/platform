import { reportError, toClientError } from '@/lib/client-error-taxonomy'
import * as v from 'valibot'

// Local-only UI cache versions are dropped on mismatch, never migrated.
export const WORKSPACE_CACHE_VERSION = 19
export const WORKSPACE_CACHE_STORAGE_PREFIX = `platform.workspace-state.v${WORKSPACE_CACHE_VERSION}`
export const WORKSPACE_CACHE_STORAGE_NAMESPACE = 'platform.workspace-state.v'

export type WorkspaceCacheWriteResult = {
  readonly serializedBytes: number | null
  readonly status:
    | 'written'
    | 'unavailable'
    | 'serialization-failed'
    | 'oversized'
    | 'storage-failed'
}

type WorkspaceCacheEntryOptions = {
  readonly maxSerializedBytes?: number
}

export function workspaceCacheStorageKey(suffix: string) {
  return `${WORKSPACE_CACHE_STORAGE_PREFIX}.${suffix}`
}

export function workspaceCacheSerializedBytes(serialized: string) {
  return serialized.length * 2
}

export function readWorkspaceCacheEntry<T>(
  key: string,
  schema: v.GenericSchema,
  fallback: T,
  options: WorkspaceCacheEntryOptions = {},
): T {
  if (!canUseWorkspaceCacheStorage()) return fallback

  try {
    const serialized = localStorage.getItem(key)
    if (!serialized) return fallback
    if (serializedEntryIsOversized(serialized, options.maxSerializedBytes)) {
      removeWorkspaceCacheEntry(key)
      reportInvalidCacheEntry()
      return fallback
    }

    const result = v.safeParse(schema, JSON.parse(serialized))
    if (result.success) return result.output as T

    removeWorkspaceCacheEntry(key)
    reportInvalidCacheEntry()
    return fallback
  } catch (error) {
    removeWorkspaceCacheEntry(key)
    reportError(toClientError({ code: 'OPERATION_FAILED', error }))
    return fallback
  }
}

export function writeWorkspaceCacheEntry(
  key: string,
  value: unknown,
  options: WorkspaceCacheEntryOptions = {},
): WorkspaceCacheWriteResult {
  if (!canUseWorkspaceCacheStorage()) {
    return { serializedBytes: null, status: 'unavailable' }
  }

  let serialized: string | undefined
  try {
    serialized = JSON.stringify(value)
  } catch {
    return { serializedBytes: null, status: 'serialization-failed' }
  }

  if (serialized === undefined) {
    return { serializedBytes: null, status: 'serialization-failed' }
  }

  const serializedBytes = workspaceCacheSerializedBytes(serialized)
  if (serializedBytes > (options.maxSerializedBytes ?? Number.POSITIVE_INFINITY)) {
    return { serializedBytes, status: 'oversized' }
  }

  try {
    localStorage.setItem(key, serialized)
    return { serializedBytes, status: 'written' }
  } catch {
    return { serializedBytes, status: 'storage-failed' }
  }
}

export function removeWorkspaceCacheEntry(key: string) {
  if (!canUseWorkspaceCacheStorage()) return

  try {
    localStorage.removeItem(key)
  } catch {
    // A blocked store must not prevent the app from opening.
  }
}

export function canUseWorkspaceCacheStorage() {
  return typeof localStorage !== 'undefined'
}

function serializedEntryIsOversized(serialized: string, maxSerializedBytes?: number) {
  if (maxSerializedBytes === undefined) return false

  return workspaceCacheSerializedBytes(serialized) > maxSerializedBytes
}

function reportInvalidCacheEntry() {
  reportError(toClientError({ code: 'INVALID_PATH' }))
}
