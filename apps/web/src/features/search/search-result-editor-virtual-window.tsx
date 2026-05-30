import type { EditorKeymapLayer, EditorPlugin, EditorTheme } from '@editor/core'
import type { WorkspaceSearchMatch } from '@workspace/contracts'
import { memo, useMemo, type RefObject } from 'react'

import { SEARCH_RESULT_VIRTUAL_PADDING } from '@/features/search/search-result-editor-constants'
import type { SearchResultEditorScrollToIndex } from '@/features/search/search-result-editor-types'
import {
  isSearchResultRenderedFileResultItem,
  searchResultRenderedVirtualItems,
} from '@/features/search/search-result-editor-utils'
import { SearchResultFileEditorPoolSlot } from '@/features/search/search-result-file-editor'
import { SearchResultFileHeaderRow } from '@/features/search/search-result-file-header-row'
import type { SearchResultId } from '@/features/search/search-result-items'
import type {
  SearchResultOpenTarget,
  SearchResultVirtualRow,
} from '@/features/search/search-result-view-model'
import { useSearchResultEditorVirtualizer } from '@/features/search/use-search-result-editor-virtualizer'
import { useSearchResultFileEditorPoolEntries } from '@/features/search/use-search-result-file-editor-pool-entries'

type SearchResultEditorVirtualWindowProps = {
  readonly activeResultId: SearchResultId | null
  readonly canReplace?: boolean
  readonly deferredPluginsReady: boolean
  readonly editorTheme: EditorTheme
  readonly keymapLayers: readonly EditorKeymapLayer[]
  readonly parentRef: RefObject<HTMLDivElement | null>
  readonly prewarmEditorPool: boolean
  readonly replaceVisible: boolean
  readonly rows: readonly SearchResultVirtualRow[]
  readonly scrollToIndexRef: RefObject<SearchResultEditorScrollToIndex>
  readonly scrollToOffsetRef: RefObject<(offset: number) => void>
  readonly syntaxPlugins: readonly EditorPlugin[]
  readonly treeId: string
  readonly onEnableDeferredPlugins: () => void
  readonly onOpenTarget: (target: SearchResultOpenTarget) => void
  readonly onReplaceFile?: (path: string) => void
  readonly onReplaceMatch?: (match: WorkspaceSearchMatch) => void
  readonly onSelectResult: (id: SearchResultId | null) => void
  readonly onSelectResultWithoutReveal: (id: SearchResultId | null) => void
  readonly onToggleGroup: (path: string) => void
}

export const SearchResultEditorVirtualWindow = memo(function SearchResultEditorVirtualWindow({
  activeResultId,
  canReplace,
  deferredPluginsReady,
  editorTheme,
  keymapLayers,
  parentRef,
  prewarmEditorPool,
  replaceVisible,
  rows,
  scrollToIndexRef,
  scrollToOffsetRef,
  syntaxPlugins,
  treeId,
  onEnableDeferredPlugins,
  onOpenTarget,
  onReplaceFile,
  onReplaceMatch,
  onSelectResult,
  onSelectResultWithoutReveal,
  onToggleGroup,
}: SearchResultEditorVirtualWindowProps) {
  const {
    items: virtualItems,
    scrollToIndex,
    scrollToOffset,
    totalSize: virtualTotalSize,
  } = useSearchResultEditorVirtualizer(rows, parentRef)
  scrollToIndexRef.current = scrollToIndex
  scrollToOffsetRef.current = scrollToOffset

  const renderedVirtualItems = useMemo(
    () => searchResultRenderedVirtualItems(virtualItems, rows),
    [rows, virtualItems],
  )
  const fileResultItems = useMemo(
    () => renderedVirtualItems.filter(isSearchResultRenderedFileResultItem),
    [renderedVirtualItems],
  )
  const fileEditorPoolEntries = useSearchResultFileEditorPoolEntries(
    fileResultItems,
    prewarmEditorPool,
  )
  const windowStyle = useMemo(
    () => ({ height: virtualTotalSize + SEARCH_RESULT_VIRTUAL_PADDING }),
    [virtualTotalSize],
  )

  return (
    <div className='relative' style={windowStyle}>
      {renderedVirtualItems.map(({ renderKey, row, virtualItem }) => {
        if (row.type !== 'file') return null

        return (
          <SearchResultFileHeaderRow
            activeResultId={activeResultId}
            canReplace={canReplace}
            key={renderKey}
            replaceVisible={replaceVisible}
            row={row}
            treeId={treeId}
            virtualItem={virtualItem}
            onReplaceFile={onReplaceFile}
            onSelectResult={onSelectResult}
            onToggleFile={onToggleGroup}
          />
        )
      })}
      {fileEditorPoolEntries.map((entry) => (
        <SearchResultFileEditorPoolSlot
          activeResultId={activeResultId}
          canReplace={canReplace}
          deferredPluginsReady={deferredPluginsReady}
          editorTheme={editorTheme}
          entry={entry}
          key={`file-results-pool:${entry.key}`}
          keymapLayers={keymapLayers}
          replaceVisible={replaceVisible}
          syntaxPlugins={syntaxPlugins}
          treeId={treeId}
          onEnableDeferredPlugins={onEnableDeferredPlugins}
          onOpenTarget={onOpenTarget}
          onReplaceMatch={onReplaceMatch}
          onSelectResultWithoutReveal={onSelectResultWithoutReveal}
        />
      ))}
    </div>
  )
})
