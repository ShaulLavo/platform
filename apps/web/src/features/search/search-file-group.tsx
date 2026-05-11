import { FileTextIcon } from "@phosphor-icons/react"
import type { WorkspaceSearchMatch } from "@workspace/contracts"

import type { WorkspaceSearchFileGroup } from "@/features/search/search-buffer-state"
import { SearchMatchRow } from "@/features/search/search-match-row"

export function SearchFileGroup({
  group,
  query,
  onOpenMatch,
}: {
  group: WorkspaceSearchFileGroup
  query: string
  onOpenMatch: (match: WorkspaceSearchMatch) => void
}) {
  return (
    <section className="rounded-md border bg-background">
      <div className="flex min-w-0 items-center gap-2 border-b px-2 py-1.5">
        <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <div className="truncate text-xs font-medium">{group.name}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {group.pathLabel}
          </div>
        </div>
      </div>
      <div className="py-1">
        {group.matches.map((match, index) => (
          <SearchMatchRow
            key={`${match.kind}:${match.source}:${match.path}:${match.line ?? "name"}:${index}`}
            match={match}
            query={query}
            onOpenMatch={onOpenMatch}
          />
        ))}
      </div>
    </section>
  )
}
