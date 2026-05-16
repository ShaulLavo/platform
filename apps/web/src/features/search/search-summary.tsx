import type { ReactNode } from "react"
import {
  ArrowsInLineVerticalIcon,
  ArrowsOutLineVerticalIcon,
  CaretDownIcon,
  CaretUpIcon,
} from "@phosphor-icons/react"

import {
  searchGroupsForSnapshot,
  type SearchBufferSnapshot,
  useSearchBufferState,
} from "@/features/search/search-buffer-state"
import {
  expandedSearchResultItems,
  searchResultActiveMatchPosition,
  searchResultContentItems,
} from "@/features/search/search-result-items"
import { SearchAnimatedNumber } from "@/features/search/search-animated-number"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

export function SearchSummary({
  buttonClassName,
  className,
  query,
  snapshot,
}: {
  buttonClassName?: string
  className?: string
  query: string
  snapshot: SearchBufferSnapshot | null
}) {
  const collapseAllGroups = useSearchBufferState(
    (state) => state.collapseAllGroups
  )
  const expandAllGroups = useSearchBufferState((state) => state.expandAllGroups)
  const selectNextMatch = useSearchBufferState((state) => state.selectNextMatch)
  const selectPreviousMatch = useSearchBufferState(
    (state) => state.selectPreviousMatch
  )
  const summary = searchSummaryModel(query, snapshot)

  return (
    <div
      className={cn(
        "mt-2 flex min-h-5 items-center gap-2 px-1 text-[11px] text-muted-foreground",
        className
      )}
    >
      <SearchSummaryText title={summary.title}>
        {summary.content}
      </SearchSummaryText>
      {summary.showControls ? (
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <SearchSummaryButton
            className={buttonClassName}
            disabled={!summary.canExpand}
            label="Expand all search results"
            onClick={expandAllGroups}
          >
            <ArrowsOutLineVerticalIcon className="size-3.5" />
          </SearchSummaryButton>
          <SearchSummaryButton
            className={buttonClassName}
            disabled={!summary.canCollapse}
            label="Collapse all search results"
            onClick={collapseAllGroups}
          >
            <ArrowsInLineVerticalIcon className="size-3.5" />
          </SearchSummaryButton>
          <SearchSummaryButton
            className={buttonClassName}
            disabled={!summary.canNavigate}
            label="Previous match"
            onClick={selectPreviousMatch}
          >
            <CaretUpIcon className="size-3.5" />
          </SearchSummaryButton>
          <SearchSummaryButton
            className={buttonClassName}
            disabled={!summary.canNavigate}
            label="Next match"
            onClick={selectNextMatch}
          >
            <CaretDownIcon className="size-3.5" />
          </SearchSummaryButton>
        </div>
      ) : null}
    </div>
  )
}

function searchSummaryModel(
  query: string,
  snapshot: SearchBufferSnapshot | null
) {
  if (!query) return emptySummary("Find in files")
  if (!snapshot) return emptySummary("Find in files")
  if (snapshot.replaceStatus === "running") return emptySummary("Replacing")
  if (snapshot.replaceStatus === "error")
    return emptySummary(snapshot.replaceMessage ?? "Replace failed")
  if (snapshot.replaceStatus === "success" && snapshot.replaceMessage)
    return summaryWithControls(snapshot.replaceMessage, snapshot)
  if (snapshot.status === "error") {
    const message = snapshot.error ?? "Search failed"
    if (hasSearchResultGroups(snapshot))
      return summaryWithControls(
        `${message} · Showing previous results`,
        snapshot
      )

    return emptySummary(message)
  }
  if (snapshot.status === "idle") return emptySummary("Searching")
  if (snapshot.status === "loading" && snapshot.matches.length === 0) {
    return emptySummary("Searching")
  }
  const result = searchResultCount(snapshot)
  if (snapshot.status === "loading") {
    return summaryWithControls(result.content, snapshot, result.title, {
      trailingText: "Searching",
    })
  }

  return summaryWithControls(result.content, snapshot, result.title)
}

function SearchSummaryText({
  children,
  title,
}: {
  children: ReactNode
  title: string
}) {
  return (
    <div className="min-w-0 flex-1 truncate" title={title}>
      {children}
    </div>
  )
}

function SearchSummaryButton({
  children,
  className,
  disabled,
  label,
  onClick,
}: {
  children: ReactNode
  className?: string
  disabled: boolean
  label: string
  onClick: () => void
}) {
  return (
    <Button
      aria-label={label}
      className={cn(
        "size-5 text-muted-foreground hover:text-foreground",
        className
      )}
      disabled={disabled}
      size="icon-xs"
      title={label}
      type="button"
      variant="ghost"
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

function emptySummary(text: string) {
  return {
    canCollapse: false,
    canExpand: false,
    canNavigate: false,
    content: text,
    showControls: false,
    title: text,
  }
}

function summaryWithControls(
  content: ReactNode,
  snapshot: SearchBufferSnapshot,
  title = String(content),
  options: { trailingText?: string } = {}
) {
  const groups = searchGroupsForSnapshot(snapshot)
  const expandedItems = expandedSearchResultItems(groups)
  const active = searchResultActiveMatchPosition(
    expandedItems,
    snapshot.activeResultId
  )
  const activeContent = active ? (
    <>
      {" "}
      <span aria-hidden="true">·</span>{" "}
      <SearchAnimatedNumber value={active.index} />
      /
      <SearchAnimatedNumber value={active.total} />
    </>
  ) : null
  const activeTitle = active ? ` · ${active.index}/${active.total}` : ""
  const trailingContent = options.trailingText ? (
    <>
      {" "}
      <span aria-hidden="true">·</span> {options.trailingText}
    </>
  ) : null
  const trailingTitle = options.trailingText ? ` · ${options.trailingText}` : ""

  return {
    canCollapse: groups.some((group) => group.count > 0 && !group.collapsed),
    canExpand: groups.some((group) => group.count > 0 && group.collapsed),
    canNavigate: searchResultContentItems(expandedItems).length > 0,
    content: (
      <>
        {content}
        {activeContent}
        {trailingContent}
      </>
    ),
    showControls: groups.some((group) => group.count > 0),
    title: `${title}${activeTitle}${trailingTitle}`,
  }
}

function hasSearchResultGroups(snapshot: SearchBufferSnapshot) {
  return searchGroupsForSnapshot(snapshot).some((group) => group.count > 0)
}

function searchResultCount(snapshot: SearchBufferSnapshot) {
  const groups = searchGroupsForSnapshot(snapshot)
  const fileCount = groups.filter((group) => group.count > 0).length
  const matchTitle = snapshot.totalCount.toLocaleString()
  const fileTitle = fileCount.toLocaleString()
  const matchSummary = snapshot.truncated ? (
    <>
      <SearchAnimatedNumber value={snapshot.totalCount} /> shown, limit reached
    </>
  ) : (
    <>
      <SearchAnimatedNumber value={snapshot.totalCount} />{" "}
      {matchNoun(snapshot.totalCount)}
    </>
  )
  const titleMatches = snapshot.truncated
    ? `${matchTitle} shown, limit reached`
    : `${matchTitle} ${matchNoun(snapshot.totalCount)}`

  return {
    content: (
      <>
        {matchSummary} in <SearchAnimatedNumber value={fileCount} />{" "}
        {fileNoun(fileCount)}
      </>
    ),
    title: `${titleMatches} in ${fileTitle} ${fileNoun(fileCount)}`,
  }
}

function matchNoun(count: number) {
  return count === 1 ? "match" : "matches"
}

function fileNoun(count: number) {
  return count === 1 ? "file" : "files"
}
