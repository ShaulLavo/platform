import type { EditorKeymapLayer, EditorTheme } from '@singapor/core'
import { memo, useRef } from 'react'

import { SEARCH_RESULT_FILE_EDITOR_POOL_HIDDEN_STYLE } from '@/features/search/search-result-editor-constants'
import type { SearchResultFileEditorPoolEntry } from '@/features/search/search-result-editor-types'
import {
  equalSearchResultFileEditorLineWindow,
  searchResultDomId,
  searchResultFileContainsId,
  searchResultFileEditorLineWindow,
  searchResultVirtualRowStyle,
  type SearchResultFileEditorLineWindow,
} from '@/features/search/search-result-editor-utils'
import { SearchResultFileEditor } from '@/features/search/search-result-file-editor'
import type { SearchResultId } from '@/features/search/search-result-items'
import { searchResultVirtualRowId } from '@/features/search/search-result-view-model'
import type { SearchResultVirtualListViewport } from '@/features/search/search-result-virtual-list'

type SearchResultFileEditorPoolSlotProps = {
  activeResultId: SearchResultId | null
  canReplace?: boolean
  editorTheme: EditorTheme
  entry: SearchResultFileEditorPoolEntry
  keymapLayers: readonly EditorKeymapLayer[]
  replaceVisible: boolean
  treeId: string
  viewport: SearchResultVirtualListViewport
}

export const SearchResultFileEditorPoolSlot = memo(
  ({
    activeResultId,
    canReplace,
    editorTheme,
    entry,
    keymapLayers,
    replaceVisible,
    treeId,
    viewport,
  }: SearchResultFileEditorPoolSlotProps) => {
    const { item, visible } = entry
    const row = item.row
    const file = row.file
    const id = searchResultVirtualRowId(row)
    const active = visible && searchResultFileContainsId(file, activeResultId)
    const lineWindowRef = useRef<SearchResultFileEditorLineWindow | null>(null)
    const nextLineWindow = searchResultFileEditorLineWindow({
      lineCount: file.excerpts.length,
      virtualItem: item.virtualItem,
      viewport,
    })
    if (
      lineWindowRef.current === null ||
      !equalSearchResultFileEditorLineWindow(lineWindowRef.current, nextLineWindow)
    ) {
      lineWindowRef.current = nextLineWindow
    }
    const lineWindow = lineWindowRef.current
    const renderEditor = lineWindow.end > lineWindow.start

    return (
      <div
        aria-hidden={visible ? undefined : true}
        aria-level={visible ? 2 : undefined}
        aria-selected={visible ? active : undefined}
        className='absolute right-2 left-2'
        data-index={visible ? item.virtualItem.index : undefined}
        id={id && visible ? searchResultDomId(treeId, id) : undefined}
        role={visible ? 'treeitem' : undefined}
        style={
          visible
            ? searchResultVirtualRowStyle(item.virtualItem)
            : SEARCH_RESULT_FILE_EDITOR_POOL_HIDDEN_STYLE
        }
      >
        {renderEditor ? (
          <SearchResultFileEditor
            active={active}
            activeResultId={active ? activeResultId : null}
            canReplace={canReplace}
            editorTheme={editorTheme}
            file={file}
            keymapLayers={keymapLayers}
            lineWindow={lineWindow}
            replaceVisible={replaceVisible}
          />
        ) : null}
      </div>
    )
  },
)
