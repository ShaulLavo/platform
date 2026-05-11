import type { WorkspaceSearchMatch } from "@workspace/contracts"
import { useVirtualizer } from "@tanstack/react-virtual"
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
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
  const parentRef = useRef<HTMLDivElement | null>(null)
  const toggleGroup = useSearchBufferState((state) => state.toggleGroup)
  const previewMaxLength = useSearchPreviewMaxLength(
    parentRef,
    replaceVisible
  )
  const items = useMemo(() => searchResultItems(groups), [groups])
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual is the search results virtualization layer.
  const virtualizer = useVirtualizer({
    count: items.length,
    estimateSize: (index) => searchResultItemEstimate(items[index]),
    getScrollElement: () => parentRef.current,
    overscan: 12,
  })

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
              key={searchResultItemKey(item)}
              style={{
                transform: `translateY(${virtualItem.start + 6}px)`,
              }}
            >
              <SearchResultRow
                item={item}
                nextItem={items[virtualItem.index + 1]}
                canReplace={canReplace}
                previewMaxLength={previewMaxLength}
                query={query}
                replaceVisible={replaceVisible}
                onOpenMatch={onOpenMatch}
                onReplaceGroup={onReplaceGroup}
                onReplaceMatch={onReplaceMatch}
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
  item,
  nextItem,
  canReplace,
  previewMaxLength,
  query,
  replaceVisible,
  onOpenMatch,
  onReplaceGroup,
  onReplaceMatch,
  onToggleGroup,
}: {
  item: SearchResultItem
  nextItem?: SearchResultItem
  canReplace?: boolean
  previewMaxLength?: number
  query: string
  replaceVisible?: boolean
  onOpenMatch: (match: WorkspaceSearchMatch) => void
  onReplaceGroup?: (group: WorkspaceSearchFileGroup) => void
  onReplaceMatch?: (match: WorkspaceSearchMatch) => void
  onToggleGroup: (path: string) => void
}) {
  if (item.type === "group") {
    return (
      <SearchFileGroupHeader
        className={cn(
          "rounded-t-md border bg-background",
          item.group.collapsed && "rounded-b-md"
        )}
        canReplace={canReplace}
        group={item.group}
        replaceVisible={replaceVisible}
        onReplace={onReplaceGroup}
        onToggle={onToggleGroup}
      />
    )
  }
  if (item.type === "name") {
    return (
      <SearchNameMatchRow
        className="rounded-md border bg-background"
        match={item.match}
        previewMaxLength={previewMaxLength}
        query={query}
        onOpenMatch={onOpenMatch}
      />
    )
  }

  return (
    <SearchMatchRow
      className={cn(
        "border-x border-b bg-background",
        isLastGroupMatch(item, nextItem) && "rounded-b-md"
      )}
      canReplace={canReplace}
      match={item.match}
      previewMaxLength={previewMaxLength}
      replaceVisible={replaceVisible}
      query={query}
      onOpenMatch={onOpenMatch}
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

function searchResultItemKey(item: SearchResultItem) {
  if (item.type === "group") return `group:${item.group.path}`
  if (item.type === "name")
    return `name:${item.match.source}:${item.match.path}`

  const match = item.match
  return [
    "match",
    item.groupPath,
    item.matchIndex,
    match.kind,
    match.source,
    match.line ?? "name",
    match.column ?? 0,
    match.endColumn ?? 0,
  ].join(":")
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
