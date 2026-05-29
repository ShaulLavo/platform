import { useCallback, useMemo } from 'react'

import type { SearchBufferOptionPatch } from '@/features/search/search-buffer-state'
import { useSearchBufferStoreApi } from '@/features/search/search-buffer-state'
import type { WorkspaceSearchQueryOptions } from '@/features/search/search-buffer-query'
import { useSearchBufferValue } from '@/features/search/use-search-buffer-value'

export function useSearchBufferInputs(rootPath: string) {
  const caseSensitive = useSearchBufferValue(rootPath, (snapshot) => snapshot.caseSensitive, false)
  const excludeGlobText = useSearchBufferValue(rootPath, (snapshot) => snapshot.excludeGlobText, '')
  const filtersVisible = useSearchBufferValue(
    rootPath,
    (snapshot) => snapshot.filtersVisible,
    false,
  )
  const includeGlobText = useSearchBufferValue(rootPath, (snapshot) => snapshot.includeGlobText, '')
  const matchMode = useSearchBufferValue(rootPath, (snapshot) => snapshot.matchMode, 'literal')
  const query = useSearchBufferValue(rootPath, (snapshot) => snapshot.query, '')
  const replaceText = useSearchBufferValue(rootPath, (snapshot) => snapshot.replaceText, '')
  const replaceVisible = useSearchBufferValue(
    rootPath,
    (snapshot) => snapshot.replaceVisible,
    false,
  )
  const replacing = useSearchBufferValue(
    rootPath,
    (snapshot) => snapshot.replaceStatus === 'running',
    false,
  )
  const wholeWord = useSearchBufferValue(rootPath, (snapshot) => snapshot.wholeWord, false)
  const store = useSearchBufferStoreApi()
  const searchOptions = useMemo<WorkspaceSearchQueryOptions>(
    () => ({
      caseSensitive,
      excludeGlobText,
      filtersVisible,
      includeGlobText,
      matchMode,
      wholeWord,
    }),
    [caseSensitive, excludeGlobText, filtersVisible, includeGlobText, matchMode, wholeWord],
  )
  const setQuery = useCallback(
    (nextQuery: string) => store.getState().setQuery(rootPath, nextQuery),
    [rootPath, store],
  )
  const setReplaceText = useCallback(
    (nextReplaceText: string) => store.getState().setReplaceText(rootPath, nextReplaceText),
    [rootPath, store],
  )
  const setReplaceVisible = useCallback(
    (nextReplaceVisible: boolean) =>
      store.getState().setReplaceVisible(rootPath, nextReplaceVisible),
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

  return {
    query,
    replaceText,
    replaceVisible,
    replacing,
    searchOptions,
    selectNextQuery,
    selectNextReplaceText,
    selectPreviousQuery,
    selectPreviousReplaceText,
    setQuery,
    setReplaceText,
    setReplaceVisible,
    setSearchOptions,
  }
}
