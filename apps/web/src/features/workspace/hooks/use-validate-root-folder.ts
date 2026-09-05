import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { clientForQueryClient, originForQueryClient } from '@/lib/environments/state/query-clients'
import { environmentActivitySignal } from '@/lib/environments/state/activity'
import type { Client } from '@/lib/client'

import {
  useEditorWorkspaceState,
  useEditorWorkspaceStoreApi,
} from '@/features/editor/state/workspace-state'
import { toClientError, type ErrorCategory } from '@/lib/client-error-taxonomy'
import { log } from '@/lib/client-logging'
import { openWorkspaceRootPath } from '@/lib/file-server'
import { claimWorkspaceOpenGeneration } from '@/features/workspace/state/open-generation'

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
  const queryClient = useQueryClient()
  const store = useEditorWorkspaceStoreApi()
  const path = useEditorWorkspaceState((state) => state.rootFolder?.path ?? null)

  useEffect(() => {
    if (path === null) return

    const controller = new AbortController()
    const signal = AbortSignal.any([
      controller.signal,
      environmentActivitySignal(originForQueryClient(queryClient)),
    ])
    const generation = claimWorkspaceOpenGeneration()
    const clearWhenStillCurrent = (reason: string) => {
      if (signal.aborted) return
      if (store.getState().rootFolder?.path !== path) return

      log.warn({ action: 'workspace.root_invalid', area: 'workspace', path, reason })
      store.getState().clearRootFolder()
    }

    void validateRootPath(
      path,
      generation,
      signal,
      clearWhenStillCurrent,
      clientForQueryClient(queryClient),
    )
    return () => controller.abort()
  }, [path, queryClient, store])
}

async function validateRootPath(
  path: string,
  generation: number,
  signal: AbortSignal,
  clear: (reason: string) => void,
  client: Client,
) {
  try {
    await openWorkspaceRootPath(path, generation, signal, client)
  } catch (error) {
    if (signal.aborted) return

    const category = toClientError(error).category
    if (!invalidRootCategories.has(category)) return

    clear(category)
  }
}
