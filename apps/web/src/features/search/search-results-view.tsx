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
  SearchEmptyState,
  SearchErrorState,
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
  groups,
  canReplace,
  query,
  replaceVisible,
  snapshot,
  onOpenMatch,
  onReplaceGroup,
  onReplaceMatch,
}: {
  className?: string
  groups: readonly WorkspaceSearchFileGroup[]
  canReplace?: boolean
  query: string
  replaceVisible?: boolean
  snapshot: SearchBufferSnapshot | null
  onOpenMatch: (match: WorkspaceSearchMatch) => void
  onReplaceGroup?: (group: WorkspaceSearchFileGroup) => void
  onReplaceMatch?: (match: WorkspaceSearchMatch) => void
}) {
  const treeId = useId()
  const parentRef = useRef<HTMLDivElement | null>(null)
  const activeResultId = snapshot?.activeResultId ?? null
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
    estimateSize: (index) => searchResultItemEstimate(items[index]),
    getScrollElement: () => parentRef.current,
    overscan: 12,
  })
  const activeIndex = activeItem ? items.indexOf(activeItem) : -1

  useLayoutEffect(() => {
    if (activeIndex < 0) return

    virtualizer.scrollToIndex(activeIndex, { align: "auto" })
  }, [activeIndex, virtualizer])

  if (!snapshot || snapshot.status === "idle") {
    return (
      <SearchEmptyState
        className={className}
        description="Search text in the selected workspace."
        title="Search workspace"
      />
    )
  }
  if (snapshot.status === "error") {
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
        style={{ height: virtualizer.getTotalSize() + 12 }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const item = items[virtualItem.index]
          if (!item) return null

          return (
            <div
              className="absolute right-1.5 left-1.5"
              id={searchResultDomId(treeId, item.id)}
              key={item.id}
              role="treeitem"
              style={{
                transform: `translateY(${virtualItem.start + 6}px)`,
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
                nextItem={items[virtualItem.index + 1]}
                canReplace={canReplace}
                previewMaxLength={previewMaxLength}
                query={query}
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

function SearchResultRow({
  active,
  item,
  nextItem,
  canReplace,
  previewMaxLength,
  query,
  replaceVisible,
  onOpenMatch,
  onReplaceGroup,
  onReplaceMatch,
  onSelectResult,
  onToggleGroup,
}: {
  active: boolean
  item: SearchResultItem
  nextItem?: SearchResultItem
  canReplace?: boolean
  previewMaxLength?: number
  query: string
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
        className={cn(
          "rounded-t-md border bg-background",
          item.group.collapsed && "rounded-b-md"
        )}
        canReplace={canReplace}
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
        className="rounded-md border bg-background"
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
    <SearchMatchRow
      active={active}
      className={cn(
        "border-x border-b bg-background",
        isLastGroupMatch(item, nextItem) && "rounded-b-md"
      )}
      canReplace={canReplace}
      match={item.match}
      previewMaxLength={previewMaxLength}
      replaceVisible={replaceVisible}
      query={query}
      onOpenMatch={() => {
        onSelectResult(item.id)
        onOpenMatch(item.match)
      }}
      onReplaceMatch={onReplaceMatch}
    />
  )
}

function isLastGroupMatch(item: SearchResultItem, nextItem?: SearchResultItem) {
  if (item.type !== "match") return false
  if (!nextItem) return true
  if (nextItem.type !== "match") return true

  return nextItem.groupPath !== item.groupPath
}

function searchResultItemEstimate(item: SearchResultItem | undefined) {
  if (item?.type === "group") return 44

  return 30
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
