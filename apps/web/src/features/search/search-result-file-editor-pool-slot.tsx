import type { EditorKeymapLayer, EditorTheme } from '@editor/core'
import type { WorkspaceSearchMatch } from '@workspace/contracts'
import { memo } from 'react'

import { SEARCH_RESULT_FILE_EDITOR_POOL_HIDDEN_STYLE } from '@/features/search/search-result-editor-constants'
import type { SearchResultFileEditorPoolEntry } from '@/features/search/search-result-editor-types'
import {
  searchResultDomId,
  searchResultFileContainsId,
  searchResultVirtualRowStyle,
} from '@/features/search/search-result-editor-utils'
import { SearchResultFileEditor } from '@/features/search/search-result-file-editor'
import type { SearchResultId } from '@/features/search/search-result-items'
import {
  searchResultVirtualRowId,
  type SearchResultOpenTarget,
} from '@/features/search/search-result-view-model'

type SearchResultFileEditorPoolSlotProps = {
  activeResultId: SearchResultId | null
  canReplace?: boolean
  editorTheme: EditorTheme
  entry: SearchResultFileEditorPoolEntry
  keymapLayers: readonly EditorKeymapLayer[]
  replaceVisible: boolean
  treeId: string
  onOpenTarget: (target: SearchResultOpenTarget) => void
  onReplaceMatch?: (match: WorkspaceSearchMatch) => void
  onSelectResultWithoutReveal: (id: SearchResultId | null) => void
}

export const SearchResultFileEditorPoolSlot = memo(({
  activeResultId,
  canReplace,
  editorTheme,
  entry,
  keymapLayers,
  replaceVisible,
  treeId,
  onOpenTarget,
  onReplaceMatch,
  onSelectResultWithoutReveal,
}: SearchResultFileEditorPoolSlotProps) => {
  const { item, visible } = entry
  const row = item.row
  const file = row.file
  const id = searchResultVirtualRowId(row)
  const active = visible && searchResultFileContainsId(file, activeResultId)

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
      <SearchResultFileEditor
        active={active}
        activeResultId={active ? activeResultId : null}
        canReplace={canReplace}
        editorTheme={editorTheme}
        file={file}
        keymapLayers={keymapLayers}
        replaceVisible={replaceVisible}
        onOpenTarget={onOpenTarget}
        onReplaceMatch={onReplaceMatch}
        onSelectResultWithoutReveal={onSelectResultWithoutReveal}
      />
    </div>
  )
})
