import type { EditorKeymapLayer } from '@singapor/core'
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

import { useFocus } from '@/components/workspace/focus/providers/focus-state'
import { useEditorColorTheme } from '@/features/editor/hooks/use-editor-color-theme'
import type { WorkspaceSearchFileGroup } from '@/features/search/search-buffer-state'
import { useSearchResultActions } from '@/features/search/hooks/use-result-actions'
import {
  SearchResultActionsContext,
  type SearchResultActions,
} from '@/features/search/providers/result-actions-context'
import { handleSearchResultSurfaceKeyDown } from '@/features/search/search-result-editor-keyboard'
import type { SearchResultEditorScrollToIndex } from '@/features/search/search-result-editor-types'
import {
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
} from '@/features/search/search-result-view-model'
import { readonlyEditorKeymapLayers } from '@/keymap/editor-keymap'

type SearchResultEditorSurfaceProps = {
  activeResultId: SearchResultId | null
  canReplace?: boolean
  displayedResultsQuery: string | null
  groups: readonly WorkspaceSearchFileGroup[]
  keymapLayers: readonly EditorKeymapLayer[]
  prewarmEditorPool?: boolean
  replaceVisible: boolean
  resultsQuery: string
}

const noopScrollToIndex: SearchResultEditorScrollToIndex = () => {}
const noopScrollToOffset = () => {}

export const SearchResultEditorSurface = memo(
  ({
    activeResultId,
    canReplace,
    displayedResultsQuery,
    groups,
    keymapLayers,
    prewarmEditorPool = true,
    replaceVisible,
    resultsQuery,
  }: SearchResultEditorSurfaceProps) => {
    const actions = useSearchResultActions()
    const treeId = useId()
    const parentRef = useRef<HTMLDivElement | null>(null)
    const setFocusArea = useFocus((state) => state.setFocusArea)
    const setActiveEditorCommandDispatch = useFocus((state) => state.setActiveEditorCommandDispatch)
    const readonlyKeymapLayers = useMemo(
      () => readonlyEditorKeymapLayers(keymapLayers),
      [keymapLayers],
    )
    const blocks = useMemo(
      () => searchResultFileBlocks(groups, resultsQuery),
      [groups, resultsQuery],
    )
    const rows = useMemo(() => searchResultVirtualRows(blocks), [blocks])
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
    const selectResultWithoutReveal = useCallback(
      (id: SearchResultId | null) => {
        if (id === activeResultId) return

        suppressNextActiveRevealRef.current = true
        actions.selectResult(id)
      },
      [actions, activeResultId],
    )
    // The editor surface changes selection reveal semantics for editor-pool interactions.
    const editorActions = useMemo<SearchResultActions>(
      () => ({
        ...actions,
        selectResultWithoutReveal,
      }),
      [actions, selectResultWithoutReveal],
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

    function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
      handleSearchResultSurfaceKeyDown({
        activeResultId,
        blocks,
        event,
        onOpenTarget: actions.openTarget,
        onSelectResult: actions.selectResult,
        onToggleGroup: actions.toggleGroup,
        rows,
      })
    }

    return (
      <div
        aria-activedescendant={
          activeRow ? searchResultDomId(treeId, searchResultVirtualRowId(activeRow)) : undefined
        }
        aria-label='Search result editor'
        className='app-scrollbar-thin min-h-0 overflow-x-hidden overflow-y-auto'
        ref={parentRef}
        role='tree'
        tabIndex={0}
        onFocusCapture={() => setFocusArea('editor')}
        onKeyDown={handleKeyDown}
        onPointerDownCapture={() => setFocusArea('editor')}
      >
        <SearchResultActionsContext value={editorActions}>
          <SearchResultEditorVirtualWindow
            activeResultId={activeResultId}
            canReplace={canReplace}
            editorTheme={editorTheme}
            keymapLayers={readonlyKeymapLayers}
            parentRef={parentRef}
            prewarmEditorPool={prewarmEditorPool}
            replaceVisible={replaceVisible}
            rows={rows}
            scrollToIndexRef={scrollToIndexRef}
            scrollToOffsetRef={scrollToOffsetRef}
            treeId={treeId}
          />
        </SearchResultActionsContext>
      </div>
    )
  },
)
SearchResultEditorSurface.displayName = 'SearchResultEditorSurface'
