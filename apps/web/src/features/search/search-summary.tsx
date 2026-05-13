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
import { Button } from "@workspace/ui/components/button"

export function SearchSummary({
  query,
  snapshot,
}: {
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
    <div className="mt-2 flex min-h-5 items-center gap-2 px-1 text-[11px] text-muted-foreground">
      <SearchSummaryText>{summary.text}</SearchSummaryText>
      {summary.showControls ? (
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <SearchSummaryButton
            disabled={!summary.canExpand}
            label="Expand all search results"
            onClick={expandAllGroups}
          >
            <ArrowsOutLineVerticalIcon className="size-3.5" />
          </SearchSummaryButton>
          <SearchSummaryButton
            disabled={!summary.canCollapse}
            label="Collapse all search results"
            onClick={collapseAllGroups}
          >
            <ArrowsInLineVerticalIcon className="size-3.5" />
          </SearchSummaryButton>
          <SearchSummaryButton
            disabled={!summary.canNavigate}
            label="Previous match"
            onClick={selectPreviousMatch}
          >
            <CaretUpIcon className="size-3.5" />
          </SearchSummaryButton>
          <SearchSummaryButton
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
  if (snapshot.status === "error")
    return emptySummary(snapshot.error ?? "Search failed")
  if (snapshot.status === "idle") return emptySummary("Searching")
  if (snapshot.status === "loading" && snapshot.matches.length === 0) {
    return emptySummary("Searching")
  }
  if (snapshot.status === "loading" && snapshot.pendingResultIds.length > 0) {
    return summaryWithControls(
      `${snapshot.totalCount.toLocaleString()} updated · Searching`,
      snapshot
    )
  }

  const resultText = searchResultCountText(snapshot)
  if (snapshot.status === "loading") {
    return summaryWithControls(`${resultText} · Searching`, snapshot)
  }

  return summaryWithControls(resultText, snapshot)
}

function SearchSummaryText({ children }: { children: ReactNode }) {
  return (
    <div className="min-w-0 flex-1 truncate" title={String(children)}>
      {children}
    </div>
  )
}

function SearchSummaryButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: ReactNode
  disabled: boolean
  label: string
  onClick: () => void
}) {
  return (
    <Button
      aria-label={label}
      className="size-5 text-muted-foreground hover:text-foreground"
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
    showControls: false,
    text,
  }
}

function summaryWithControls(text: string, snapshot: SearchBufferSnapshot) {
  const groups = searchGroupsForSnapshot(snapshot)
  const expandedItems = expandedSearchResultItems(groups)
  const active = searchResultActiveMatchPosition(
    expandedItems,
    snapshot.activeResultId
  )
  const activeText = active ? ` · ${active.index}/${active.total}` : ""

  return {
    canCollapse: groups.some((group) => group.count > 0 && !group.collapsed),
    canExpand: groups.some((group) => group.count > 0 && group.collapsed),
    canNavigate: searchResultContentItems(expandedItems).length > 0,
    showControls: groups.some((group) => group.count > 0),
    text: `${text}${activeText}`,
  }
}

function searchResultCountText(snapshot: SearchBufferSnapshot) {
  const groups = searchGroupsForSnapshot(snapshot)
  const fileCount = groups.filter((group) => group.count > 0).length
  const files = `${fileCount.toLocaleString()} ${fileNoun(fileCount)}`
  const count = snapshot.totalCount.toLocaleString()
  const matches = snapshot.truncated
    ? `${count} shown, limit reached`
    : `${count} ${matchNoun(snapshot.totalCount)}`

  return `${matches} in ${files}`
}

function matchNoun(count: number) {
  return count === 1 ? "match" : "matches"
}

function fileNoun(count: number) {
  return count === 1 ? "file" : "files"
}
