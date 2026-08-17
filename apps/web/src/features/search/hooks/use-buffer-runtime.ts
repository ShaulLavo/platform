import { useDebouncedValue } from '@tanstack/react-pacer/debouncer'

import { useSearchBufferState } from '@/features/search/state/buffer-state'
import { usePrepareSearchBuffer } from '@/features/search/hooks/use-prepare-buffer'
import { useRunSearchBuffer } from '@/features/search/hooks/use-run-buffer'

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
  const [debouncedQuery] = useDebouncedValue(query, { wait: SEARCH_DEBOUNCE_MS })
  const [debouncedIncludeGlobText] = useDebouncedValue(includeGlobText, {
    wait: SEARCH_DEBOUNCE_MS,
  })
  const [debouncedExcludeGlobText] = useDebouncedValue(excludeGlobText, {
    wait: SEARCH_DEBOUNCE_MS,
  })

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
