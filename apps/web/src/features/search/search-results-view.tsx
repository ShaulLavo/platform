import type { WorkspaceSearchMatch } from "@workspace/contracts"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useMemo, useRef } from "react"

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

export function SearchResultsView({
  className,
  groups,
  query,
  snapshot,
  onOpenMatch,
}: {
  className?: string
  groups: readonly WorkspaceSearchFileGroup[]
  query: string
  snapshot: SearchBufferSnapshot | null
  onOpenMatch: (match: WorkspaceSearchMatch) => void
}) {
  const parentRef = useRef<HTMLDivElement | null>(null)
  const toggleGroup = useSearchBufferState((state) => state.toggleGroup)
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
        description="Search text and filenames in the selected workspace."
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
      className={cn("app-scrollbar-thin min-h-0 overflow-auto", className)}
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
                query={query}
                onOpenMatch={onOpenMatch}
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
  query,
  onOpenMatch,
  onToggleGroup,
}: {
  item: SearchResultItem
  nextItem?: SearchResultItem
  query: string
  onOpenMatch: (match: WorkspaceSearchMatch) => void
  onToggleGroup: (path: string) => void
}) {
  if (item.type === "group") {
    return (
      <SearchFileGroupHeader
        className={cn(
          "rounded-t-md border bg-background",
          item.group.collapsed && "rounded-b-md"
        )}
        group={item.group}
        onToggle={onToggleGroup}
      />
    )
  }
  if (item.type === "name") {
    return (
      <SearchNameMatchRow
        className="rounded-md border bg-background"
        match={item.match}
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
      match={item.match}
      query={query}
      onOpenMatch={onOpenMatch}
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
