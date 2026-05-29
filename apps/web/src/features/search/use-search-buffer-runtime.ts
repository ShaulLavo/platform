import { useSearchBufferState } from '@/features/search/search-buffer-state'
import { useDebouncedValue } from '@/features/search/use-debounced-value'
import { usePrepareSearchBuffer } from '@/features/search/use-prepare-search-buffer'
import { useRunSearchBuffer } from '@/features/search/use-run-search-buffer'

const SEARCH_DEBOUNCE_MS = 180

export function useSearchBufferRuntime(rootPath: string, enabled = true) {
  const caseSensitive = useSearchBufferState((state) =>
    enabled && state.active?.rootPath === rootPath ? state.active.caseSensitive : false,
  )
  const excludeGlobText = useSearchBufferState((state) =>
    enabled && state.active?.rootPath === rootPath ? state.active.excludeGlobText : '',
  )
  const filtersVisible = useSearchBufferState((state) =>
    enabled && state.active?.rootPath === rootPath ? state.active.filtersVisible : false,
  )
  const includeGlobText = useSearchBufferState((state) =>
    enabled && state.active?.rootPath === rootPath ? state.active.includeGlobText : '',
  )
  const matchMode = useSearchBufferState((state) =>
    enabled && state.active?.rootPath === rootPath ? state.active.matchMode : 'literal',
  )
  const query = useSearchBufferState((state) =>
    enabled && state.active?.rootPath === rootPath ? state.active.query : '',
  )
  const searchRevision = useSearchBufferState((state) =>
    enabled && state.active?.rootPath === rootPath ? state.active.searchRevision : 0,
  )
  const wholeWord = useSearchBufferState((state) =>
    enabled && state.active?.rootPath === rootPath ? state.active.wholeWord : false,
  )
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS)
  const debouncedIncludeGlobText = useDebouncedValue(includeGlobText, SEARCH_DEBOUNCE_MS)
  const debouncedExcludeGlobText = useDebouncedValue(excludeGlobText, SEARCH_DEBOUNCE_MS)

  usePrepareSearchBuffer(rootPath, enabled)
  useRunSearchBuffer(rootPath, enabled ? debouncedQuery : '', searchRevision, {
    caseSensitive,
    excludeGlobText: debouncedExcludeGlobText,
    filtersVisible,
    includeGlobText: debouncedIncludeGlobText,
    matchMode,
    wholeWord,
  })
}
