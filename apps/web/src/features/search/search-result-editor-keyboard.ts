import type { KeyboardEvent } from 'react'

import type { SearchResultId } from '@/features/search/search-result-items'
import {
  firstSearchResultExcerptId,
  firstSearchResultVirtualRowId,
  lastSearchResultVirtualRowId,
  parentSearchResultFileId,
  searchResultOpenTargetForId,
  searchResultVirtualRowById,
  searchResultVirtualRowIdByOffset,
  type SearchResultFileBlock,
  type SearchResultOpenTarget,
  type SearchResultVirtualRow,
} from '@/features/search/search-result-view-model'

export function handleSearchResultSurfaceKeyDown({
  activeResultId,
  blocks,
  event,
  onOpenTarget,
  onSelectResult,
  onToggleGroup,
  rows,
}: {
  activeResultId: SearchResultId | null
  blocks: readonly SearchResultFileBlock[]
  event: KeyboardEvent<HTMLDivElement>
  onOpenTarget: (target: SearchResultOpenTarget) => void
  onSelectResult: (id: SearchResultId | null) => void
  onToggleGroup: (path: string) => void
  rows: readonly SearchResultVirtualRow[]
}) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    onSelectResult(searchResultVirtualRowIdByOffset({ activeResultId, offset: 1, rows }))
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    onSelectResult(searchResultVirtualRowIdByOffset({ activeResultId, offset: -1, rows }))
    return
  }
  if (event.key === 'Home') {
    event.preventDefault()
    onSelectResult(firstSearchResultVirtualRowId(rows))
    return
  }
  if (event.key === 'End') {
    event.preventDefault()
    onSelectResult(lastSearchResultVirtualRowId(rows))
    return
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    moveIntoSearchResultFile(rows, activeResultId, onSelectResult, onToggleGroup)
    return
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    moveOutOfSearchResultFile(rows, activeResultId, onSelectResult, onToggleGroup)
    return
  }
  if (event.key !== 'Enter') return

  event.preventDefault()
  const target = searchResultOpenTargetForId(blocks, activeResultId)
  if (target) onOpenTarget(target)
}

function moveIntoSearchResultFile(
  rows: readonly SearchResultVirtualRow[],
  activeResultId: SearchResultId | null,
  onSelectResult: (id: SearchResultId | null) => void,
  onToggleGroup: (path: string) => void,
) {
  const active = searchResultVirtualRowById(rows, activeResultId)
  if (active?.type !== 'file') return

  if (active.file.collapsed) {
    onToggleGroup(active.file.path)
    return
  }

  onSelectResult(firstSearchResultExcerptId(rows, active.file.id) ?? active.file.id)
}

function moveOutOfSearchResultFile(
  rows: readonly SearchResultVirtualRow[],
  activeResultId: SearchResultId | null,
  onSelectResult: (id: SearchResultId | null) => void,
  onToggleGroup: (path: string) => void,
) {
  const parentId = parentSearchResultFileId(rows, activeResultId)
  if (parentId) {
    onSelectResult(parentId)
    return
  }

  const active = searchResultVirtualRowById(rows, activeResultId)
  if (active?.type !== 'file') return
  if (active.file.collapsed) return
  if (active.file.excerpts.length === 0) return

  onToggleGroup(active.file.path)
}
