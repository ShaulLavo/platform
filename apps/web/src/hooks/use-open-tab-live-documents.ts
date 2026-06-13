import { useEffect, useEffectEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import {
  type LiveEditorDocument,
  useEditorDocumentState,
} from '@/features/editor/state/editor-document-state'
import { parseConflictDiffDocumentId } from '@/features/editor/conflict-diff-document'
import { useEditorWorkspaceStoreApi } from '@/features/editor/state/editor-workspace-state'
import { parseDiffDocumentId } from '@/features/git/diff-document'
import { parseSearchBufferDocumentId } from '@/features/search/search-buffer-document'
import type { FileResult } from '@/lib/file-system-types'
import { fileSnapshotQueryOptions } from '@/lib/file-snapshot-query-cache'
import { fetchFile } from '@/lib/file-server'

type OpenTabLiveDocumentContext = {
  ensureLiveEditorDocument: (file: FileResult) => LiveEditorDocument
  getLiveEditorDocument: (path: string) => LiveEditorDocument | null
  isActive: () => boolean
  queryClient: ReturnType<typeof useQueryClient>
}

const OPEN_TAB_LIVE_DOCUMENT_CONCURRENCY = 4

export function useOpenTabLiveDocuments() {
  const workspaceStore = useEditorWorkspaceStoreApi()
  const ensureLiveEditorDocument = useEditorDocumentState((state) => state.ensureLiveEditorDocument)
  const getLiveEditorDocument = useEditorDocumentState((state) => state.getLiveEditorDocument)
  const queryClient = useQueryClient()
  const warmPaths = useEffectEvent((openFilePaths: readonly string[], isActive: () => boolean) => {
    const paths = unwarmedOpenFilePaths(openFilePaths, getLiveEditorDocument)
    if (paths.length === 0) return

    void warmOpenTabLiveDocuments(paths, {
      ensureLiveEditorDocument,
      getLiveEditorDocument,
      isActive,
      queryClient,
    })
  })

  useEffect(() => {
    let active = true
    const isActive = () => active

    warmPaths(workspaceStore.getState().openFilePaths, isActive)

    const unsubscribe = workspaceStore.subscribe((state, previousState) => {
      if (state.openFilePaths === previousState.openFilePaths) return

      warmPaths(state.openFilePaths, isActive)
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [workspaceStore])
}

function unwarmedOpenFilePaths(
  openFilePaths: readonly string[],
  getLiveEditorDocument: (path: string) => LiveEditorDocument | null,
) {
  return openFilePaths.filter(
    (path) =>
      !parseDiffDocumentId(path) &&
      !parseConflictDiffDocumentId(path) &&
      !parseSearchBufferDocumentId(path) &&
      !getLiveEditorDocument(path),
  )
}

async function warmOpenTabLiveDocuments(
  paths: readonly string[],
  context: OpenTabLiveDocumentContext,
) {
  let nextIndex = 0
  const workerCount = Math.min(paths.length, OPEN_TAB_LIVE_DOCUMENT_CONCURRENCY)
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (context.isActive()) {
        const path = paths[nextIndex]
        nextIndex += 1
        if (!path) return

        await warmOpenTabLiveDocument(path, context)
      }
    }),
  )
}

async function warmOpenTabLiveDocument(path: string, context: OpenTabLiveDocumentContext) {
  if (context.getLiveEditorDocument(path)) return

  await warmOpenFileLiveDocument(path, context)
}

async function warmOpenFileLiveDocument(
  path: string,
  {
    ensureLiveEditorDocument,
    getLiveEditorDocument,
    isActive,
    queryClient,
  }: OpenTabLiveDocumentContext,
) {
  try {
    const file = await queryClient.ensureQueryData({
      ...fileSnapshotQueryOptions(path),
      queryFn: ({ signal }) => fetchFile(path, signal),
    })
    if (!isActive()) return
    if (getLiveEditorDocument(path)) return

    ensureLiveEditorDocument(file)
  } catch {
    // Background tab warming should not interrupt the active editor.
  }
}
