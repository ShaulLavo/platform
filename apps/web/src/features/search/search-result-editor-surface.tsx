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
import { handleSearchResultSurfaceKeyDown } from '@/features/search/search-result-editor-keyboard'
import type {
  SearchResultDeferredPluginMode,
  SearchResultEditorScrollToIndex,
} from '@/features/search/search-result-editor-types'
import {
  groupMap,
  resetSearchResultScroll,
  scrollActiveSearchResultIntoView,
  searchResultDomId,
  searchResultVirtualRowIndex,
  searchResultVirtualRowScrollTarget,
} from '@/features/search/search-result-editor-utils'
import { SearchResultEditorVirtualWindow } from '@/features/search/search-result-editor-virtual-window'
import type { SearchResultId } from '@/features/search/search-result-items'
import {
  searchResultFileBlocks,
  searchResultVirtualRowById,
  searchResultVirtualRowId,
  searchResultVirtualRows,
  type SearchResultOpenTarget,
} from '@/features/search/search-result-view-model'
import { useSearchResultDeferredPlugins } from '@/features/search/use-search-result-deferred-plugins'
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

const noopScrollToIndex: SearchResultEditorScrollToIndex = () => {}
const noopScrollToOffset = () => {}

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
    const scrollToIndexRef = useRef<SearchResultEditorScrollToIndex>(noopScrollToIndex)
    const scrollToOffsetRef = useRef<(offset: number) => void>(noopScrollToOffset)
    const { editorTheme } = useEditorColorTheme()
    const deferredPlugins = useSearchResultDeferredPlugins({
      mode: deferredPluginMode,
      resultKey: displayedResultsQuery,
      rowCount: rows.length,
    })
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
    }, [activeIndex, activeScrollTarget])

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
      resetSearchResultScroll(parentRef, scrollToOffsetRef.current)
      const frame = window.requestAnimationFrame(() =>
        resetSearchResultScroll(parentRef, scrollToOffsetRef.current),
      )

      return () => window.cancelAnimationFrame(frame)
    }, [displayedResultsQuery])

    useEffect(() => {
      if (activeRow?.type === 'file-results') return

      setActiveEditorCommandDispatch(null)
    }, [activeRow, setActiveEditorCommandDispatch])

    const handleReplaceFile = useCallback(
      (path: string) => {
        const group = groupByPath.get(path)
        if (!group) return

        onReplaceGroup?.(group)
      },
      [groupByPath, onReplaceGroup],
    )

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
      >
        <SearchResultEditorVirtualWindow
          activeResultId={activeResultId}
          canReplace={canReplace}
          deferredPluginsReady={deferredPlugins.ready}
          editorTheme={editorTheme}
          keymapLayers={readonlyKeymapLayers}
          parentRef={parentRef}
          prewarmEditorPool={prewarmEditorPool}
          replaceVisible={replaceVisible}
          rows={rows}
          scrollToIndexRef={scrollToIndexRef}
          scrollToOffsetRef={scrollToOffsetRef}
          syntaxPlugins={deferredPlugins.syntaxPlugins}
          treeId={treeId}
          onEnableDeferredPlugins={deferredPlugins.enable}
          onOpenTarget={onOpenTarget}
          onReplaceFile={handleReplaceFile}
          onReplaceMatch={onReplaceMatch}
          onSelectResult={onSelectResult}
          onSelectResultWithoutReveal={selectResultWithoutReveal}
          onToggleGroup={onToggleGroup}
        />
      </div>
    )
  },
)
SearchResultEditorSurface.displayName = 'SearchResultEditorSurface'
