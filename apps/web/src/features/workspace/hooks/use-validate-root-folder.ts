import { useEffect } from 'react'

import {
  useEditorWorkspaceState,
  useEditorWorkspaceStoreApi,
} from '@/features/editor/state/workspace-state'
import { toClientError, type ErrorCategory } from '@/lib/client-error-taxonomy'
import { log } from '@/lib/client-logging'
import { statPath } from '@/lib/file-server'
import { isDirectoryEntry } from '@workspace/contracts'

// Categories that prove the cached path can never be a workspace root again.
// Transient failures (io_error, unknown, auth) keep the root so a flaky server
// cannot wipe the user's workspace.
const invalidRootCategories: ReadonlySet<ErrorCategory> = new Set<ErrorCategory>([
  'not_found',
  'not_a_directory',
  'invalid_path',
])

// The root folder is restored from a per-browser localStorage cache, so it can
// point at a directory that was deleted or never existed on this machine.
// Validate it against the file server and fall back to the folder picker
// instead of rendering an empty workspace that looks like a broken FS.
export function useValidateRootFolder() {
  const store = useEditorWorkspaceStoreApi()
  const path = useEditorWorkspaceState((state) => state.rootFolder?.path ?? null)

  useEffect(() => {
    if (path === null) return

    const controller = new AbortController()
    const clearWhenStillCurrent = (reason: string) => {
      if (controller.signal.aborted) return
      if (store.getState().rootFolder?.path !== path) return

      log.warn({ action: 'workspace.root_invalid', area: 'workspace', path, reason })
      store.getState().clearRootFolder()
    }

    void validateRootPath(path, controller.signal, clearWhenStillCurrent)
    return () => controller.abort()
  }, [path, store])
}

async function validateRootPath(
  path: string,
  signal: AbortSignal,
  clear: (reason: string) => void,
) {
  try {
    const entry = await statPath(path, signal)
    if (isDirectoryEntry(entry)) return

    clear('not_a_directory')
  } catch (error) {
    if (signal.aborted) return

    const category = toClientError(error).category
    if (!invalidRootCategories.has(category)) return

    clear(category)
  }
}
