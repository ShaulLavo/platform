import '@editor/core/style.css'
import '@editor/find/style.css'

import type { EditorKeymapLayer } from '@editor/core'
import type { WorkspaceSearchMatch } from '@workspace/contracts'
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
} from 'react'

import { useWorkspaceFocus } from '@/components/workspace/workspace-focus-state'
import { useEditorColorTheme } from '@/features/editor/hooks/use-editor-color-theme'
import type { WorkspaceSearchFileGroup } from '@/features/search/search-buffer-state'
import { SEARCH_RESULT_VIRTUAL_PADDING } from '@/features/search/search-result-editor-constants'
import { handleSearchResultSurfaceKeyDown } from '@/features/search/search-result-editor-keyboard'
import type { SearchResultDeferredPluginMode } from '@/features/search/search-result-editor-types'
import {
  groupMap,
  isSearchResultRenderedFileResultItem,
  resetSearchResultScroll,
  scrollActiveSearchResultIntoView,
  searchResultDomId,
  searchResultFileContainsId,
  searchResultRenderedVirtualItems,
  searchResultVirtualRowExpanded,
  searchResultVirtualRowIndex,
  searchResultVirtualRowScrollTarget,
  searchResultVirtualRowStyle,
} from '@/features/search/search-result-editor-utils'
import { SearchResultFileEditorPoolSlot } from '@/features/search/search-result-file-editor'
import { SearchResultFileHeader } from '@/features/search/search-result-file-header'
import type { SearchResultId } from '@/features/search/search-result-items'
import {
  searchResultFileBlocks,
  searchResultVirtualRowById,
  searchResultVirtualRowId,
  searchResultVirtualRows,
  type SearchResultOpenTarget,
} from '@/features/search/search-result-view-model'
import { useSearchResultDeferredPlugins } from '@/features/search/use-search-result-deferred-plugins'
import { useSearchResultEditorVirtualizer } from '@/features/search/use-search-result-editor-virtualizer'
import { useSearchResultFileEditorPoolEntries } from '@/features/search/use-search-result-file-editor-pool-entries'
import { readonlyEditorKeymapLayers } from '@/keymap'

type SearchResultEditorSurfaceProps = {
  activeResultId: SearchResultId | null
  canReplace?: boolean
  deferredPluginMode?: SearchResultDeferredPluginMode
  displayedResultsQuery: string | null
  groups: readonly WorkspaceSearchFileGroup[]
  keymapLayers: readonly EditorKeymapLayer[]
  prewarmEditorPool?: boolean
  replaceVisible: boolean
  resultsQuery: string
  onOpenTarget: (target: SearchResultOpenTarget) => void
  onReplaceGroup?: (group: WorkspaceSearchFileGroup) => void
  onReplaceMatch?: (match: WorkspaceSearchMatch) => void
  onSelectResult: (id: SearchResultId | null) => void
  onToggleGroup: (path: string) => void
}

export const SearchResultEditorSurface = memo(
  ({
    activeResultId,
    canReplace,
    deferredPluginMode = 'immediate',
    displayedResultsQuery,
    groups,
    keymapLayers,
    prewarmEditorPool = true,
    replaceVisible,
    resultsQuery,
    onOpenTarget,
    onReplaceGroup,
    onReplaceMatch,
    onSelectResult,
    onToggleGroup,
  }: SearchResultEditorSurfaceProps) => {
    const treeId = useId()
    const parentRef = useRef<HTMLDivElement | null>(null)
    const setFocusArea = useWorkspaceFocus((state) => state.setFocusArea)
    const setActiveEditorCommandDispatch = useWorkspaceFocus(
      (state) => state.setActiveEditorCommandDispatch,
    )
    const readonlyKeymapLayers = useMemo(
      () => readonlyEditorKeymapLayers(keymapLayers),
      [keymapLayers],
    )
    const blocks = useMemo(
      () => searchResultFileBlocks(groups, resultsQuery),
      [groups, resultsQuery],
    )
    const rows = useMemo(() => searchResultVirtualRows(blocks), [blocks])
    const groupByPath = useMemo(() => groupMap(groups), [groups])
    const activeRow = useMemo(
      () => searchResultVirtualRowById(rows, activeResultId),
      [activeResultId, rows],
    )
    const activeIndex = useMemo(
      () => searchResultVirtualRowIndex(rows, activeResultId),
      [activeResultId, rows],
    )
    const activeScrollTarget = useMemo(
      () => searchResultVirtualRowScrollTarget(activeRow, activeResultId),
      [activeResultId, activeRow],
    )
    const suppressNextActiveRevealRef = useRef(false)
    const previousDisplayedResultsQueryRef = useRef<string | null>(null)
    const activeIndexRef = useRef(activeIndex)
    const activeScrollTargetRef = useRef(activeScrollTarget)
    const { editorTheme } = useEditorColorTheme()
    const deferredPlugins = useSearchResultDeferredPlugins({
      mode: deferredPluginMode,
      resultKey: displayedResultsQuery,
      rowCount: rows.length,
    })

    const {
      items: virtualItems,
      onScroll: handleVirtualScroll,
      scrollToIndex,
      scrollToOffset,
      totalSize: virtualTotalSize,
    } = useSearchResultEditorVirtualizer(rows, parentRef)
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
    const scrollToIndexRef = useRef(scrollToIndex)
    const selectResultWithoutReveal = useCallback(
      (id: SearchResultId | null) => {
        if (id === activeResultId) return

        suppressNextActiveRevealRef.current = true
        onSelectResult(id)
      },
      [activeResultId, onSelectResult],
    )

    useLayoutEffect(() => {
      activeIndexRef.current = activeIndex
      activeScrollTargetRef.current = activeScrollTarget
      scrollToIndexRef.current = scrollToIndex
    }, [activeIndex, activeScrollTarget, scrollToIndex])

    useLayoutEffect(() => {
      if (!activeResultId) return
      if (suppressNextActiveRevealRef.current) {
        suppressNextActiveRevealRef.current = false
        return
      }

      scrollActiveSearchResultIntoView({
        activeIndexRef,
        activeScrollTargetRef,
        scrollToIndexRef,
      })
    }, [activeResultId])

    useLayoutEffect(() => {
      if (displayedResultsQuery === null) return
      if (previousDisplayedResultsQueryRef.current === displayedResultsQuery) return

      previousDisplayedResultsQueryRef.current = displayedResultsQuery
      resetSearchResultScroll(parentRef, scrollToOffset)
      const frame = window.requestAnimationFrame(() =>
        resetSearchResultScroll(parentRef, scrollToOffset),
      )

      return () => window.cancelAnimationFrame(frame)
    }, [displayedResultsQuery, scrollToOffset])

    useEffect(() => {
      if (activeRow?.type === 'file-results') return

      setActiveEditorCommandDispatch(null)
    }, [activeRow, setActiveEditorCommandDispatch])

    function handleReplaceFile(path: string) {
      const group = groupByPath.get(path)
      if (!group) return

      onReplaceGroup?.(group)
    }

    function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
      handleSearchResultSurfaceKeyDown({
        activeResultId,
        blocks,
        event,
        onOpenTarget,
        onSelectResult,
        onToggleGroup,
        rows,
      })
    }

    return (
      <div
        aria-activedescendant={
          activeRow ? searchResultDomId(treeId, searchResultVirtualRowId(activeRow)) : undefined
        }
        aria-label='Search result editor'
        className='app-scrollbar-thin bg-background min-h-0 overflow-x-hidden overflow-y-auto'
        ref={parentRef}
        role='tree'
        tabIndex={0}
        onFocusCapture={() => setFocusArea('editor')}
        onKeyDown={handleKeyDown}
        onPointerDownCapture={() => setFocusArea('editor')}
        onScroll={handleVirtualScroll}
      >
        <div
          className='relative'
          style={{ height: virtualTotalSize + SEARCH_RESULT_VIRTUAL_PADDING }}
        >
          {renderedVirtualItems.map(({ renderKey, row, virtualItem }) => {
            if (row.type !== 'file') return null

            const id = searchResultVirtualRowId(row)
            const active = searchResultFileContainsId(row.file, activeResultId)

            return (
              <div
                aria-expanded={searchResultVirtualRowExpanded(row)}
                aria-level={1}
                aria-selected={active}
                className='absolute right-2 left-2'
                data-index={virtualItem.index}
                id={searchResultDomId(treeId, id)}
                key={renderKey}
                role='treeitem'
                style={searchResultVirtualRowStyle(virtualItem)}
                onMouseDown={() => onSelectResult(id)}
              >
                <SearchResultFileHeader
                  active={active}
                  canReplace={canReplace}
                  file={row.file}
                  replaceVisible={replaceVisible}
                  onReplace={() => handleReplaceFile(row.file.path)}
                  onToggle={() => onToggleGroup(row.file.path)}
                />
              </div>
            )
          })}
          {fileEditorPoolEntries.map((entry) => (
            <SearchResultFileEditorPoolSlot
              activeResultId={activeResultId}
              canReplace={canReplace}
              deferredPluginsReady={deferredPlugins.ready}
              editorTheme={editorTheme}
              entry={entry}
              key={`file-results-pool:${entry.key}`}
              keymapLayers={readonlyKeymapLayers}
              replaceVisible={replaceVisible}
              syntaxPlugins={deferredPlugins.syntaxPlugins}
              treeId={treeId}
              onEnableDeferredPlugins={deferredPlugins.enable}
              onOpenTarget={onOpenTarget}
              onReplaceMatch={onReplaceMatch}
              onSelectResultWithoutReveal={selectResultWithoutReveal}
            />
          ))}
        </div>
      </div>
    )
  },
)
SearchResultEditorSurface.displayName = 'SearchResultEditorSurface'
