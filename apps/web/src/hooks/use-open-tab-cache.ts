import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"

import {
  type CachedEditorDocument,
  useEditorDocumentState,
} from "@/features/editor/state/editor-document-state"
import { parseConflictDiffDocumentId } from "@/features/editor/conflict-diff-document"
import { useEditorWorkspaceState } from "@/features/editor/state/editor-workspace-state"
import { parseDiffDocumentId } from "@/features/git/diff-document"
import type { FileResult } from "@/lib/file-system-types"
import { fetchFile } from "@/lib/file-server"
import { fileSystemKeys } from "@/lib/query-keys"

type OpenTabCacheContext = {
  ensureCachedEditorDocument: (file: FileResult) => CachedEditorDocument
  getCachedEditorDocument: (path: string) => CachedEditorDocument | null
  isActive: () => boolean
  queryClient: ReturnType<typeof useQueryClient>
}

export function useOpenTabCache() {
  const openFilePaths = useEditorWorkspaceState((state) => state.openFilePaths)
  const ensureCachedEditorDocument = useEditorDocumentState(
    (state) => state.ensureCachedEditorDocument
  )
  const getCachedEditorDocument = useEditorDocumentState(
    (state) => state.getCachedEditorDocument
  )
  const queryClient = useQueryClient()

  useEffect(() => {
    const paths = openFilePaths.filter(
      (path) =>
        !parseDiffDocumentId(path) &&
        !parseConflictDiffDocumentId(path) &&
        !getCachedEditorDocument(path)
    )
    if (!paths.length) return

    let active = true

    void cacheOpenTabs(paths, {
      ensureCachedEditorDocument,
      getCachedEditorDocument,
      isActive: () => active,
      queryClient,
    })

    return () => {
      active = false
    }
  }, [
    ensureCachedEditorDocument,
    getCachedEditorDocument,
    openFilePaths,
    queryClient,
  ])
}

async function cacheOpenTabs(
  paths: readonly string[],
  context: OpenTabCacheContext
) {
  await Promise.all(paths.map((path) => cacheOpenTab(path, context)))
}

async function cacheOpenTab(path: string, context: OpenTabCacheContext) {
  if (context.getCachedEditorDocument(path)) return

  await cacheOpenFileTab(path, context)
}

async function cacheOpenFileTab(
  path: string,
  {
    ensureCachedEditorDocument,
    getCachedEditorDocument,
    isActive,
    queryClient,
  }: OpenTabCacheContext
) {
  try {
    const file = await queryClient.ensureQueryData({
      queryFn: ({ signal }) => fetchFile(path, signal),
      queryKey: fileSystemKeys.file(path),
    })
    if (!isActive()) return
    if (getCachedEditorDocument(path)) return

    ensureCachedEditorDocument(file)
  } catch {
    // Background tab warming should not interrupt the active editor.
  }
}
