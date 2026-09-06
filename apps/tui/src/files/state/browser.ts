import { isDirectoryEntry, type FileTreeEntry } from '@workspace/contracts'
import {
  readDirectory,
  readEntry,
  readFilePreview,
  readServerPaths,
} from '@workspace/client-core/files/read'
import { parsePickerPathInput } from '@workspace/client-core/files/path-input'
import type { Client } from '@workspace/client-core/transport/client'
import type { KeyValueStorage } from '@workspace/client-core/storage'

import { connectionFailure } from '@/connection/utils/failure'
import { parentDirectory, type FileLocation } from '@/files/utils/list'

type ServerPaths = Awaited<ReturnType<typeof readServerPaths>>
type Listing =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'ready'; readonly entries: readonly FileTreeEntry[] }
type Preview =
  | { readonly kind: 'empty' }
  | { readonly kind: 'loading'; readonly path: string }
  | { readonly kind: 'failed'; readonly path: string; readonly message: string }
  | { readonly kind: 'ready'; readonly path: string; readonly content: string }

export function createFileBrowser(client: Client, storage: KeyValueStorage) {
  const listeners = new Set<() => void>()
  let state: {
    paths: ServerPaths | null
    path: string
    listing: Listing
    preview: Preview
    location: FileLocation | null
  } = {
    paths: null,
    path: '',
    listing: { kind: 'loading' },
    preview: { kind: 'empty' },
    location: null,
  }
  let request = new AbortController()
  let preview = new AbortController()
  let disposed = false

  function publish(next: typeof state) {
    if (disposed) return
    state = next
    for (const listener of listeners) listener()
  }

  async function navigate(path: string) {
    if (disposed) return
    request.abort()
    preview.abort()
    const controller = new AbortController()
    request = controller
    await loadDirectory(path, controller)
  }

  async function loadDirectory(
    path: string,
    controller: AbortController,
    destination: 'directory' | 'file' = 'directory',
  ) {
    publish({ ...state, path, listing: { kind: 'loading' }, preview: { kind: 'empty' } })
    try {
      const result = await readDirectory({ client, path, signal: controller.signal })
      controller.signal.throwIfAborted()
      const entries = result.entries.toSorted(
        (left, right) =>
          Number(isDirectoryEntry(right)) - Number(isDirectoryEntry(left)) ||
          left.name.localeCompare(right.name),
      )
      storage.setItem('file-picker-directory', result.path)
      const location: FileLocation | null =
        state.paths && destination === 'directory'
          ? {
              path: result.path,
              rootPath: state.paths.defaultPath,
              kind: 'directory',
            }
          : state.location
      publish({ ...state, path: result.path, listing: { kind: 'ready', entries }, location })
      return !controller.signal.aborted
    } catch (error) {
      if (controller.signal.aborted) return false
      publish({ ...state, listing: { kind: 'failed', message: connectionFailure(error).message } })
      return false
    }
  }

  async function open(initialPath?: string) {
    if (disposed) return
    request.abort()
    preview.abort()
    const controller = new AbortController()
    request = controller
    try {
      const paths = await readServerPaths({ client, signal: controller.signal })
      controller.signal.throwIfAborted()
      publish({ ...state, paths })
      if (initialPath) {
        const entry = await readEntry({ client, path: initialPath, signal: controller.signal })
        if (!isDirectoryEntry(entry)) {
          if (!(await loadDirectory(parentDirectory(initialPath), controller, 'file'))) return
          controller.signal.throwIfAborted()
          await select({ ...entry, name: initialPath.split('/').at(-1) ?? initialPath })
          return
        }
      }
      await loadDirectory(
        initialPath ?? storage.getItem('file-picker-directory') ?? paths.defaultPath,
        controller,
      )
    } catch (error) {
      if (controller.signal.aborted) return
      publish({ ...state, listing: { kind: 'failed', message: connectionFailure(error).message } })
    }
  }

  async function select(entry: FileTreeEntry) {
    if (isDirectoryEntry(entry)) return navigate(entry.path)
    if (disposed) return
    preview.abort()
    const controller = new AbortController()
    preview = controller
    publish({ ...state, preview: { kind: 'loading', path: entry.path } })
    try {
      const file = await readFilePreview({ client, path: entry.path, signal: controller.signal })
      controller.signal.throwIfAborted()
      const location: FileLocation | null = state.paths
        ? {
            path: file.path,
            rootPath: state.paths.defaultPath,
            kind: 'file',
          }
        : state.location
      publish({
        ...state,
        preview: { kind: 'ready', path: file.path, content: file.content },
        location,
      })
    } catch (error) {
      if (controller.signal.aborted) return
      publish({
        ...state,
        preview: { kind: 'failed', path: entry.path, message: connectionFailure(error).message },
      })
    }
  }

  async function completePath(input: string) {
    if (!state.paths || disposed) return input
    const parsed = parsePickerPathInput(input, state.paths)
    if (parsed.error !== null) return input
    const parent = input.endsWith('/') ? parsed.path : parentDirectory(parsed.path)
    const prefix = input.endsWith('/') ? '' : (parsed.path.split('/').at(-1) ?? '')
    const signal = request.signal
    try {
      const result = await readDirectory({ client, path: parent, signal })
      signal.throwIfAborted()
      const matches = result.entries.filter(
        (entry) => isDirectoryEntry(entry) && entry.name.startsWith(prefix),
      )
      if (matches.length !== 1) return input
      return `${state.paths.workspaceRoot.replace(/\/$/, '')}/${matches[0].path}/`
    } catch (error) {
      if (signal.aborted) return input
      throw error
    }
  }

  return {
    open,
    navigate,
    select,
    completePath,
    clearPreview() {
      if (state.preview.kind === 'empty') return
      preview.abort()
      const location: FileLocation | null =
        state.paths && state.listing.kind === 'ready'
          ? {
              path: state.path,
              rootPath: state.paths.defaultPath,
              kind: 'directory',
            }
          : state.location
      publish({ ...state, preview: { kind: 'empty' }, location })
    },
    enterPath(input: string) {
      if (!state.paths) return 'Server paths are not available yet.'
      const parsed = parsePickerPathInput(input, state.paths)
      if (parsed.error !== null) return parsed.error
      void navigate(parsed.path)
      return null
    },
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    dispose() {
      disposed = true
      request.abort()
      preview.abort()
      listeners.clear()
    },
  }
}

export type FileBrowser = ReturnType<typeof createFileBrowser>
