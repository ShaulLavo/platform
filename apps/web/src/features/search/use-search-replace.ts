import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef } from 'react'

import { useEditorDocumentStoreApi } from '@/features/editor/state/editor-document-state'
import type {
  SearchBufferSnapshot,
  WorkspaceSearchFileGroup,
} from '@/features/search/search-buffer-state'
import {
  useSearchBufferState,
  useSearchBufferStoreApi,
} from '@/features/search/search-buffer-state'
import {
  replaceWorkspaceSearchMatches,
  workspaceSearchReplaceSummary,
} from '@/features/search/search-replace-runner'
import { setFileContentQueryData } from '@/lib/file-query-cache'
import { fetchFile, writeFileContent } from '@/lib/file-server'
import type { WorkspaceSearchMatch, WorkspaceSearchQuery } from '@workspace/contracts'

export function useWorkspaceSearchReplace(rootPath: string, enabled = true) {
  const canReplaceValue = useSearchBufferState((state) => {
    if (!enabled) return false
    if (state.active?.rootPath !== rootPath) return false

    return canReplace(state.active)
  })
  const store = useSearchBufferStoreApi()
  const documentStore = useEditorDocumentStoreApi()
  const queryClient = useQueryClient()
  const controllerRef = useRef<AbortController | null>(null)

  const replaceMatches = useCallback(
    (matches: readonly WorkspaceSearchMatch[]) => {
      const controller = new AbortController()
      controllerRef.current?.abort()
      controllerRef.current = controller

      void runReplace({
        controller,
        documentStore,
        matches,
        queryClient,
        rootPath,
        store,
      }).finally(() => {
        if (controllerRef.current === controller) controllerRef.current = null
      })
    },
    [documentStore, queryClient, rootPath, store],
  )
  const replaceAll = useCallback(() => {
    const snapshot = store.getState().active
    if (snapshot?.rootPath !== rootPath) return

    replaceMatches(snapshot.matches)
  }, [replaceMatches, rootPath, store])
  const replaceGroup = useCallback(
    (group: WorkspaceSearchFileGroup) => replaceMatches(group.matches),
    [replaceMatches],
  )
  const replaceMatch = useCallback(
    (match: WorkspaceSearchMatch) => replaceMatches([match]),
    [replaceMatches],
  )
  const replaceNext = useCallback(() => {
    const snapshot = store.getState().active
    if (snapshot?.rootPath !== rootPath) return

    const match = firstContentMatch(snapshot.matches)
    if (match) replaceMatches([match])
  }, [replaceMatches, rootPath, store])

  return {
    canReplace: canReplaceValue,
    replaceAll,
    replaceGroup,
    replaceMatch,
    replaceNext,
  }
}

type RunReplaceInput = {
  controller: AbortController
  documentStore: ReturnType<typeof useEditorDocumentStoreApi>
  matches: readonly WorkspaceSearchMatch[]
  queryClient: ReturnType<typeof useQueryClient>
  rootPath: string
  store: ReturnType<typeof useSearchBufferStoreApi>
}

async function runReplace({
  controller,
  documentStore,
  matches,
  queryClient,
  rootPath,
  store,
}: RunReplaceInput) {
  const snapshot = store.getState().active
  if (!canReplace(snapshot)) return
  if (snapshot.rootPath !== rootPath) return

  const contentMatches = matches.filter((match) => match.kind === 'content')
  if (contentMatches.length === 0) return

  store.getState().startReplace(rootPath)

  try {
    const result = await replaceWorkspaceSearchMatches({
      context: {
        cacheFile: (file) => setFileContentQueryData(queryClient, file),
        fetchFile,
        getCachedEditorDocument: documentStore.getState().getCachedEditorDocument,
        recordCachedEditorDocumentTextChange:
          documentStore.getState().recordCachedEditorDocumentTextChange,
        signal: controller.signal,
        writeFileContent,
      },
      matches: contentMatches,
      query: snapshot.resultsSearchQuery,
      replaceText: snapshot.replaceText,
    })
    if (controller.signal.aborted) return

    store.getState().finishReplace(rootPath, workspaceSearchReplaceSummary(result))
    store.getState().requestSearchRefresh(rootPath)
  } catch (error) {
    if (controller.signal.aborted) return

    store.getState().failReplace(rootPath, replaceErrorMessage(error))
  }
}

type ReplaceableSearchBufferSnapshot = SearchBufferSnapshot & {
  resultsSearchQuery: WorkspaceSearchQuery
}

function canReplace(
  snapshot: SearchBufferSnapshot | null,
): snapshot is ReplaceableSearchBufferSnapshot {
  if (!snapshot) return false
  if (!snapshot.resultsSearchQuery) return false
  if (snapshot.replaceStatus === 'running') return false
  if (snapshot.status === 'loading') return false

  return firstContentMatch(snapshot.matches) !== null
}

function firstContentMatch(matches: readonly WorkspaceSearchMatch[]) {
  return matches.find((match) => match.kind === 'content') ?? null
}

function replaceErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message

  return 'Replace failed.'
}
