import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"

import type { CachedEditorDocument } from "@/components/editor/editor-state"
import { useEditorState } from "@/components/editor/editor-state"
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
  const openFilePaths = useEditorState((state) => state.openFilePaths)
  const ensureCachedEditorDocument = useEditorState(
    (state) => state.ensureCachedEditorDocument
  )
  const getCachedEditorDocument = useEditorState(
    (state) => state.getCachedEditorDocument
  )
  const queryClient = useQueryClient()

  useEffect(() => {
    const paths = openFilePaths.filter(
      (path) => !parseDiffDocumentId(path) && !getCachedEditorDocument(path)
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
