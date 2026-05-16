import type { WorkspaceSearchMatch } from "@workspace/contracts"
import { useVirtualizer } from "@tanstack/react-virtual"
import {
  useLayoutEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react"

import { SearchFileGroupHeader } from "@/features/search/search-file-group"
import type {
  SearchBufferSnapshot,
  WorkspaceSearchFileGroup,
} from "@/features/search/search-buffer-state"
import { useSearchBufferState } from "@/features/search/search-buffer-state"
import {
  SearchMatchRow,
  SearchNameMatchRow,
} from "@/features/search/search-match-row"
import {
  firstSearchResultChildId,
  firstSearchResultId,
  lastSearchResultId,
  parentSearchResultId,
  searchResultIdByOffset,
  searchResultItemById,
  searchResultItems,
  type SearchResultItem,
} from "@/features/search/search-result-items"
import {
  SearchErrorState,
  SearchIdleState,
  SearchPendingOrEmpty,
} from "@/features/search/search-status-states"
import { cn } from "@workspace/ui/lib/utils"

const SEARCH_PREVIEW_MAX_CHARACTERS = 96
const SEARCH_PREVIEW_MIN_CHARACTERS = 16
const SEARCH_RESULT_CHARACTER_WIDTH = 7
const SEARCH_RESULT_ROW_CHROME_WIDTH = 84
const SEARCH_RESULT_REPLACE_WIDTH = 62

export function SearchResultsView({
  className,
  compact,
  groups,
  canReplace,
  query,
  replaceText,
  replaceVisible,
  snapshot,
  onOpenMatch,
  onReplaceGroup,
  onReplaceMatch,
}: {
  className?: string
  compact?: boolean
  groups: readonly WorkspaceSearchFileGroup[]
  canReplace?: boolean
  query: string
  replaceText: string
  replaceVisible?: boolean
  snapshot: SearchBufferSnapshot | null
  onOpenMatch: (match: WorkspaceSearchMatch) => void
  onReplaceGroup?: (group: WorkspaceSearchFileGroup) => void
  onReplaceMatch?: (match: WorkspaceSearchMatch) => void
}) {
  const treeId = useId()
  const parentRef = useRef<HTMLDivElement | null>(null)
  const activeResultId = snapshot?.activeResultId ?? null
  const displayedResultsQuery = snapshot?.resultsSearchQuery?.query ?? null
  const previousDisplayedResultsQueryRef = useRef<string | null>(null)
  const selectResult = useSearchBufferState((state) => state.selectResult)
  const toggleGroup = useSearchBufferState((state) => state.toggleGroup)
  const previewMaxLength = useSearchPreviewMaxLength(parentRef, replaceVisible)
  const items = useMemo(() => searchResultItems(groups), [groups])
  const activeItem = useMemo(
    () => searchResultItemById(items, activeResultId),
    [activeResultId, items]
  )
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual is the search results virtualization layer.
  const virtualizer = useVirtualizer({
    count: items.length,
    estimateSize: (index) => searchResultItemEstimate(items[index], compact),
    getItemKey: (index) =>
      `${compact ? "compact" : "default"}:${items[index]?.id ?? index}`,
    getScrollElement: () => parentRef.current,
    overscan: 12,
  })
  const activeIndex = activeItem ? items.indexOf(activeItem) : -1
  const activeIndexRef = useRef(activeIndex)
  const virtualizerRef = useRef(virtualizer)

  useLayoutEffect(() => {
    activeIndexRef.current = activeIndex
    virtualizerRef.current = virtualizer
  }, [activeIndex, virtualizer])

  useLayoutEffect(() => {
    if (!activeResultId) return

    scrollActiveSearchResultIntoView(activeIndexRef, virtualizerRef)
  }, [activeResultId])

  useLayoutEffect(() => {
    if (displayedResultsQuery === null) return
    if (previousDisplayedResultsQueryRef.current === displayedResultsQuery)
      return

    previousDisplayedResultsQueryRef.current = displayedResultsQuery
    resetSearchResultScroll(parentRef, virtualizer)
    const frame = window.requestAnimationFrame(() =>
      resetSearchResultScroll(parentRef, virtualizer)
    )

    return () => window.cancelAnimationFrame(frame)
  }, [displayedResultsQuery, virtualizer])

  if (!snapshot || snapshot.status === "idle") {
    return <SearchIdleState className={className} />
  }
  if (snapshot.status === "error" && groups.length === 0) {
    return <SearchErrorState className={className} message={snapshot.error} />
  }
  if (groups.length === 0) {
    return <SearchPendingOrEmpty className={className} snapshot={snapshot} />
  }

  return (
    <div
      className={cn(
        "app-scrollbar-thin min-h-0 overflow-x-hidden overflow-y-auto",
        className
      )}
      ref={parentRef}
      role="tree"
      tabIndex={0}
      aria-activedescendant={
        activeItem ? searchResultDomId(treeId, activeItem.id) : undefined
      }
      aria-label="Search results"
      onKeyDown={(event) =>
        handleSearchResultKeyDown({
          activeResultId,
          event,
          items,
          onOpenMatch,
          onSelectResult: selectResult,
          onToggleGroup: toggleGroup,
        })
      }
    >
      <div
        className="relative"
        style={{
          height: virtualizer.getTotalSize() + resultListPadding(compact) * 2,
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const item = items[virtualItem.index]
          if (!item) return null

          return (
            <div
              className={cn(
                "absolute right-1.5 left-1.5",
                compact && "right-1 left-1"
              )}
              id={searchResultDomId(treeId, item.id)}
              key={item.id}
              role="treeitem"
              style={{
                height: virtualItem.size,
                transform: `translateY(${
                  virtualItem.start + resultListPadding(compact)
                }px)`,
              }}
              aria-expanded={
                item.type === "group" ? !item.group.collapsed : undefined
              }
              aria-level={item.level}
              aria-selected={item.id === activeResultId}
              onMouseDown={() => selectResult(item.id)}
            >
              <SearchResultRow
                item={item}
                active={item.id === activeResultId}
                canReplace={canReplace}
                compact={compact}
                previewMaxLength={previewMaxLength}
                query={query}
                replaceQuery={snapshot.resultsSearchQuery}
                replaceText={replaceText}
                replaceVisible={replaceVisible}
                onOpenMatch={onOpenMatch}
                onReplaceGroup={onReplaceGroup}
                onReplaceMatch={onReplaceMatch}
                onSelectResult={selectResult}
                onToggleGroup={toggleGroup}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function resetSearchResultScroll(
  ref: RefObject<HTMLDivElement | null>,
  virtualizer: ReturnType<typeof useVirtualizer<HTMLDivElement, Element>>
) {
  if (ref.current) ref.current.scrollTop = 0

  virtualizer.scrollToOffset(0)
}

function scrollActiveSearchResultIntoView(
  activeIndexRef: RefObject<number>,
  virtualizerRef: RefObject<
    ReturnType<typeof useVirtualizer<HTMLDivElement, Element>>
  >
) {
  const currentActiveIndex = activeIndexRef.current
  if (currentActiveIndex < 0) return

  virtualizerRef.current.scrollToIndex(currentActiveIndex, { align: "auto" })
}

function SearchResultRow({
  active,
  item,
  canReplace,
  compact,
  previewMaxLength,
  query,
  replaceQuery,
  replaceText,
  replaceVisible,
  onOpenMatch,
  onReplaceGroup,
  onReplaceMatch,
  onSelectResult,
  onToggleGroup,
}: {
  active: boolean
  item: SearchResultItem
  canReplace?: boolean
  compact?: boolean
  previewMaxLength?: number
  query: string
  replaceQuery: SearchBufferSnapshot["resultsSearchQuery"]
  replaceText: string
  replaceVisible?: boolean
  onOpenMatch: (match: WorkspaceSearchMatch) => void
  onReplaceGroup?: (group: WorkspaceSearchFileGroup) => void
  onReplaceMatch?: (match: WorkspaceSearchMatch) => void
  onSelectResult: (id: string | null) => void
  onToggleGroup: (path: string) => void
}) {
  if (item.type === "group") {
    return (
      <SearchFileGroupHeader
        active={active}
        canReplace={canReplace}
        compact={compact}
        group={item.group}
        replaceVisible={replaceVisible}
        onReplace={onReplaceGroup}
        onToggle={() => {
          onSelectResult(item.id)
          onToggleGroup(item.group.path)
        }}
      />
    )
  }
  if (item.type === "name") {
    return (
      <SearchNameMatchRow
        active={active}
        compact={compact}
        match={item.match}
        previewMaxLength={previewMaxLength}
        query={query}
        onOpenMatch={() => {
          onSelectResult(item.id)
          onOpenMatch(item.match)
        }}
      />
    )
  }

  return (
    <div className={cn("ml-4 border-l", compact && "ml-3")}>
      <SearchMatchRow
        active={active}
        canReplace={canReplace}
        compact={compact}
        match={item.match}
        previewMaxLength={previewMaxLength}
        replaceQuery={replaceQuery}
        replaceText={replaceText}
        replaceVisible={replaceVisible}
        query={query}
        onOpenMatch={() => {
          onSelectResult(item.id)
          onOpenMatch(item.match)
        }}
        onReplaceMatch={onReplaceMatch}
      />
    </div>
  )
}

function searchResultItemEstimate(
  item: SearchResultItem | undefined,
  compact: boolean | undefined
) {
  if (item?.type === "group") return compact ? 24 : 44

  return compact ? 24 : 30
}

function resultListPadding(compact: boolean | undefined) {
  return compact ? 4 : 6
}

function useSearchPreviewMaxLength(
  ref: RefObject<HTMLDivElement | null>,
  replaceVisible: boolean | undefined
) {
  const width = useElementWidth(ref)

  return useMemo(
    () => searchPreviewMaxLength(width, replaceVisible),
    [replaceVisible, width]
  )
}

function useElementWidth<TElement extends HTMLElement>(
  ref: RefObject<TElement | null>
) {
  const [width, setWidth] = useState<number | null>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    function updateWidth() {
      setWidth(element?.clientWidth ?? null)
    }

    updateWidth()

    if (!("ResizeObserver" in window)) return

    const observer = new ResizeObserver(updateWidth)
    observer.observe(element)

    return () => observer.disconnect()
  }, [ref])

  return width
}

function searchPreviewMaxLength(
  width: number | null,
  replaceVisible: boolean | undefined
) {
  if (width === null) return undefined

  const replaceWidth = replaceVisible ? SEARCH_RESULT_REPLACE_WIDTH : 0
  const availableWidth = width - SEARCH_RESULT_ROW_CHROME_WIDTH - replaceWidth
  const visibleCharacters = Math.floor(
    availableWidth / SEARCH_RESULT_CHARACTER_WIDTH
  )

  return Math.min(
    SEARCH_PREVIEW_MAX_CHARACTERS,
    Math.max(SEARCH_PREVIEW_MIN_CHARACTERS, visibleCharacters)
  )
}

function handleSearchResultKeyDown({
  activeResultId,
  event,
  items,
  onOpenMatch,
  onSelectResult,
  onToggleGroup,
}: {
  activeResultId: string | null
  event: KeyboardEvent<HTMLDivElement>
  items: readonly SearchResultItem[]
  onOpenMatch: (match: WorkspaceSearchMatch) => void
  onSelectResult: (id: string | null) => void
  onToggleGroup: (path: string) => void
}) {
  if (event.key === "ArrowDown") {
    event.preventDefault()
    onSelectResult(searchResultIdByOffset({ activeResultId, items, offset: 1 }))
    return
  }
  if (event.key === "ArrowUp") {
    event.preventDefault()
    onSelectResult(
      searchResultIdByOffset({ activeResultId, items, offset: -1 })
    )
    return
  }
  if (event.key === "Home") {
    event.preventDefault()
    onSelectResult(firstSearchResultId(items))
    return
  }
  if (event.key === "End") {
    event.preventDefault()
    onSelectResult(lastSearchResultId(items))
    return
  }
  if (event.key === "ArrowRight") {
    event.preventDefault()
    moveIntoSearchResultGroup(
      items,
      activeResultId,
      onSelectResult,
      onToggleGroup
    )
    return
  }
  if (event.key === "ArrowLeft") {
    event.preventDefault()
    moveOutOfSearchResultGroup(
      items,
      activeResultId,
      onSelectResult,
      onToggleGroup
    )
    return
  }
  if (event.key !== "Enter") return

  event.preventDefault()
  commitSearchResult(items, activeResultId, onOpenMatch, onToggleGroup)
}

function moveIntoSearchResultGroup(
  items: readonly SearchResultItem[],
  activeResultId: string | null,
  onSelectResult: (id: string | null) => void,
  onToggleGroup: (path: string) => void
) {
  const active = searchResultItemById(items, activeResultId)
  if (active?.type !== "group") return

  if (active.group.collapsed) {
    onToggleGroup(active.group.path)
    return
  }

  onSelectResult(firstSearchResultChildId(items, active.id) ?? active.id)
}

function moveOutOfSearchResultGroup(
  items: readonly SearchResultItem[],
  activeResultId: string | null,
  onSelectResult: (id: string | null) => void,
  onToggleGroup: (path: string) => void
) {
  const parentId = parentSearchResultId(items, activeResultId)
  if (parentId) {
    onSelectResult(parentId)
    return
  }

  const active = searchResultItemById(items, activeResultId)
  if (active?.type !== "group") return
  if (active.group.collapsed) return

  onToggleGroup(active.group.path)
}

function commitSearchResult(
  items: readonly SearchResultItem[],
  activeResultId: string | null,
  onOpenMatch: (match: WorkspaceSearchMatch) => void,
  onToggleGroup: (path: string) => void
) {
  const active = searchResultItemById(items, activeResultId)
  if (!active) return
  if (active.type === "group") {
    onToggleGroup(active.group.path)
    return
  }

  onOpenMatch(active.match)
}

function searchResultDomId(treeId: string, itemId: string) {
  return `${treeId}-${itemId}`
}
