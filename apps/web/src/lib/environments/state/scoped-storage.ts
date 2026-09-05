import { environmentIdSchema, type EnvironmentId } from '@workspace/contracts'
import * as v from 'valibot'

export type StorageAccess = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & {
  readonly keys: (prefix: string) => readonly string[]
}

export type ScopedStorage = StorageAccess & {
  readonly environmentId: EnvironmentId
}

function browserStorage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage
}

export const globalChromeStorage: StorageAccess = {
  getItem: (key) => browserStorage()?.getItem(key) ?? null,
  setItem: (key, value) => browserStorage()?.setItem(key, value),
  removeItem: (key) => browserStorage()?.removeItem(key),
  keys(prefix) {
    const storage = browserStorage()
    if (!storage) return []
    return Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(
      (key): key is string => key !== null && key.startsWith(prefix),
    )
  },
}

export function environmentScopedStorage(environmentId: EnvironmentId): ScopedStorage {
  const namespace = `env:${environmentId}|`
  return {
    environmentId,
    getItem: (key) => globalChromeStorage.getItem(`${namespace}${key}`),
    setItem: (key, value) => globalChromeStorage.setItem(`${namespace}${key}`, value),
    removeItem: (key) => globalChromeStorage.removeItem(`${namespace}${key}`),
    keys: (prefix) =>
      globalChromeStorage.keys(`${namespace}${prefix}`).map((key) => key.slice(namespace.length)),
  }
}

export function storedEnvironmentScopes(key: string): readonly ScopedStorage[] {
  try {
    const suffix = `|${key}`
    return globalChromeStorage.keys('env:').flatMap((storedKey) => {
      if (!storedKey.endsWith(suffix)) return []
      const parsed = v.safeParse(environmentIdSchema, storedKey.slice(4, -suffix.length))
      return parsed.success ? [environmentScopedStorage(parsed.output)] : []
    })
  } catch {
    return []
  }
}
