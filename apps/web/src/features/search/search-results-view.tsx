import type { WorkspaceSearchMatch } from "@workspace/contracts"

import { SearchFileGroup } from "@/features/search/search-file-group"
import type {
  SearchBufferSnapshot,
  WorkspaceSearchFileGroup,
} from "@/features/search/search-buffer-state"
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
    <div className={cn("app-scrollbar-thin min-h-0 overflow-auto", className)}>
      <div className="space-y-1.5 p-1.5">
        {groups.map((group) => (
          <SearchFileGroup
            group={group}
            key={group.path}
            query={query}
            onOpenMatch={onOpenMatch}
          />
        ))}
      </div>
    </div>
  )
}
