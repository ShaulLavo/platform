import { useCallback } from 'react'

import { searchOptionsForSnapshot } from '@/features/search/search-buffer-options'
import {
  searchGroupsForSnapshot,
  type SearchBufferOptionPatch,
  useSearchBufferState,
  useSearchBufferStoreApi,
} from '@/features/search/search-buffer-state'
import { usePrepareSearchBuffer } from '@/features/search/use-prepare-search-buffer'

export function useSearchBuffer(rootPath: string) {
  const snapshot = useSearchBufferState((state) => state.active)
  const activeSnapshot = snapshot?.rootPath === rootPath ? snapshot : null
  const groups = searchGroupsForSnapshot(activeSnapshot)
  const store = useSearchBufferStoreApi()
  const query = activeSnapshot?.query ?? ''
  const searchOptions = searchOptionsForSnapshot(activeSnapshot)
  const setQuery = useCallback(
    (nextQuery: string) => store.getState().setQuery(rootPath, nextQuery),
    [rootPath, store],
  )
  const setReplaceText = useCallback(
    (replaceText: string) => store.getState().setReplaceText(rootPath, replaceText),
    [rootPath, store],
  )
  const setReplaceVisible = useCallback(
    (replaceVisible: boolean) => store.getState().setReplaceVisible(rootPath, replaceVisible),
    [rootPath, store],
  )
  const setSearchOptions = useCallback(
    (options: SearchBufferOptionPatch) => store.getState().setSearchOptions(rootPath, options),
    [rootPath, store],
  )
  const selectNextQuery = useCallback(
    () => store.getState().selectNextQuery(rootPath),
    [rootPath, store],
  )
  const selectNextReplaceText = useCallback(
    () => store.getState().selectNextReplaceText(rootPath),
    [rootPath, store],
  )
  const selectPreviousQuery = useCallback(
    () => store.getState().selectPreviousQuery(rootPath),
    [rootPath, store],
  )
  const selectPreviousReplaceText = useCallback(
    () => store.getState().selectPreviousReplaceText(rootPath),
    [rootPath, store],
  )

  usePrepareSearchBuffer(rootPath)

  return {
    groups,
    query,
    resultsQuery: activeSnapshot?.resultsQuery || query,
    resultsSearchQuery: activeSnapshot?.resultsSearchQuery,
    replaceText: activeSnapshot?.replaceText ?? '',
    replaceVisible: activeSnapshot?.replaceVisible ?? false,
    searchOptions,
    setQuery,
    setReplaceText,
    setReplaceVisible,
    setSearchOptions,
    selectNextQuery,
    selectNextReplaceText,
    selectPreviousQuery,
    selectPreviousReplaceText,
    snapshot: activeSnapshot,
  }
}
