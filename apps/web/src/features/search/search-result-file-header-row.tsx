import { memo, useCallback } from 'react'

import {
  searchResultDomId,
  searchResultFileContainsId,
  searchResultVirtualRowExpanded,
  searchResultVirtualRowStyle,
} from '@/features/search/search-result-editor-utils'
import { SearchResultFileHeader } from '@/features/search/search-result-file-header'
import type { SearchResultId } from '@/features/search/search-result-items'
import {
  searchResultVirtualRowId,
  type SearchResultVirtualRow,
} from '@/features/search/search-result-view-model'
import type { SearchResultVirtualListMetrics } from '@/features/search/search-result-virtual-list'

type SearchResultFileHeaderRowProps = {
  readonly activeResultId: SearchResultId | null
  readonly canReplace?: boolean
  readonly replaceVisible: boolean
  readonly row: Extract<SearchResultVirtualRow, { type: 'file' }>
  readonly treeId: string
  readonly virtualItem: SearchResultVirtualListMetrics['items'][number]
  readonly onReplaceFile?: (path: string) => void
  readonly onSelectResult: (id: SearchResultId | null) => void
  readonly onToggleFile: (path: string) => void
}

export const SearchResultFileHeaderRow = memo(
  ({
    activeResultId,
    canReplace,
    replaceVisible,
    row,
    treeId,
    virtualItem,
    onReplaceFile,
    onSelectResult,
    onToggleFile,
  }: SearchResultFileHeaderRowProps) => {
    const id = searchResultVirtualRowId(row)
    const active = searchResultFileContainsId(row.file, activeResultId)
    const handleMouseDown = useCallback(() => onSelectResult(id), [id, onSelectResult])

    return (
      <div
        aria-expanded={searchResultVirtualRowExpanded(row)}
        aria-level={1}
        aria-selected={active}
        className='absolute right-2 left-2'
        data-index={virtualItem.index}
        id={searchResultDomId(treeId, id)}
        role='treeitem'
        style={searchResultVirtualRowStyle(virtualItem)}
        onMouseDown={handleMouseDown}
      >
        <SearchResultFileHeader
          active={active}
          canReplace={canReplace}
          file={row.file}
          replaceVisible={replaceVisible}
          onReplaceFile={onReplaceFile}
          onToggleFile={onToggleFile}
        />
      </div>
    )
  },
)
