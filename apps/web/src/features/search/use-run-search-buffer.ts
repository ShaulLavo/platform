import { useEffect } from 'react'

import { useEditorDocumentStoreApi } from '@/features/editor/state/editor-document-state'
import { dirtySearchDocuments } from '@/features/search/search-buffer-dirty-documents'
import type { WorkspaceSearchQueryOptions } from '@/features/search/search-buffer-query'
import { workspaceSearchQuery } from '@/features/search/search-buffer-query'
import { useSearchBufferStoreApi } from '@/features/search/search-buffer-state'
import {
  runSearch,
  shouldDeferInitialOpenBufferMatches,
  workspaceSearchProvider,
} from '@/features/search/search-buffer-runner'
import { shouldStartWorkspaceSearch } from '@/features/search/search-run-state'
import { useRunDirtySearchBufferOverlay } from '@/features/search/use-run-dirty-search-buffer-overlay'

export function useRunSearchBuffer(
  rootPath: string,
  query: string,
  searchRevision: number,
  searchOptions: WorkspaceSearchQueryOptions,
) {
  const { caseSensitive, excludeGlobText, filtersVisible, includeGlobText, matchMode, wholeWord } =
    searchOptions
  const store = useSearchBufferStoreApi()
  const documentStore = useEditorDocumentStoreApi()

  useEffect(() => {
    if (!query) return

    const controller = new AbortController()
    const searchQuery = workspaceSearchQuery(rootPath, query, {
      caseSensitive,
      excludeGlobText,
      filtersVisible,
      includeGlobText,
      matchMode,
      wholeWord,
    })
    const activeSnapshot = store.getState().active
    if (!shouldStartWorkspaceSearch(activeSnapshot, searchQuery)) return

    const documentState = documentStore.getState()
    const dirtyDocuments = dirtySearchDocuments(
      documentState.liveDocumentsById,
      documentState.dirtyFilePaths,
      rootPath,
    )
    const provider = workspaceSearchProvider(dirtyDocuments)
    const deferInitialOpenBufferMatches = shouldDeferInitialOpenBufferMatches(
      activeSnapshot,
      searchQuery,
    )
    const runId = store.getState().startSearch(searchQuery)

    void runSearch(provider, searchQuery, runId, store, controller.signal, {
      deferInitialOpenBufferMatches,
    })

    return () => controller.abort()
  }, [
    documentStore,
    query,
    rootPath,
    searchRevision,
    caseSensitive,
    excludeGlobText,
    filtersVisible,
    includeGlobText,
    matchMode,
    wholeWord,
    store,
  ])

  useRunDirtySearchBufferOverlay(rootPath, query, searchOptions)
}
