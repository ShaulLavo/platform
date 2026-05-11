import type { ReactNode } from "react"

import type { SearchBufferSnapshot } from "@/features/search/search-buffer-state"

export function SearchSummary({
  query,
  snapshot,
}: {
  query: string
  snapshot: SearchBufferSnapshot | null
}) {
  if (!query) return <SearchSummaryText>Find in files</SearchSummaryText>
  if (!snapshot) return <SearchSummaryText>Find in files</SearchSummaryText>
  if (snapshot.status === "error")
    return <SearchSummaryText>{snapshot.error ?? "Search failed"}</SearchSummaryText>
  if (snapshot.status === "idle")
    return <SearchSummaryText>Searching</SearchSummaryText>
  if (snapshot.status === "loading" && snapshot.matches.length === 0) {
    return <SearchSummaryText>Searching</SearchSummaryText>
  }

  const suffix = snapshot.truncated ? "shown, limit reached" : "matches"
  if (snapshot.status === "loading") {
    return (
      <SearchSummaryText>
        {snapshot.totalCount.toLocaleString()} {suffix} · Searching
      </SearchSummaryText>
    )
  }

  return (
    <SearchSummaryText>
      {snapshot.totalCount.toLocaleString()} {suffix}
    </SearchSummaryText>
  )
}

function SearchSummaryText({ children }: { children: ReactNode }) {
  return (
    <div className="mt-2 min-h-4 truncate px-1 text-[11px] text-muted-foreground">
      {children}
    </div>
  )
}
