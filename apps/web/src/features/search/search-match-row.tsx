import { FileTextIcon } from "@phosphor-icons/react"
import type { WorkspaceSearchMatch } from "@workspace/contracts"

import { searchMatchDisplay } from "@/features/search/search-match-display"
import { HighlightedPreview } from "@/features/search/search-highlight"
import { cn } from "@workspace/ui/lib/utils"

export function SearchMatchRow({
  className,
  match,
  query,
  onOpenMatch,
}: {
  className?: string
  match: WorkspaceSearchMatch
  query: string
  onOpenMatch: (match: WorkspaceSearchMatch) => void
}) {
  const location = searchMatchLocation(match)
  const display = searchMatchDisplay(match, query)

  return (
    <button
      className={cn(
        "grid w-full grid-cols-[42px_minmax(0,1fr)] gap-2 px-2 py-1.5 text-left text-xs outline-none hover:bg-muted/70 focus-visible:ring-1 focus-visible:ring-ring/50",
        className
      )}
      type="button"
      onClick={() => onOpenMatch(match)}
    >
      <span className="text-right text-[11px] text-muted-foreground tabular-nums">
        {location}
      </span>
      <span className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate font-mono text-[11px] leading-5">
          <HighlightedPreview
            preview={display.text}
            query={query}
            range={display.range}
          />
        </span>
        {match.source === "open-buffer" ? (
          <span className="shrink-0 rounded border px-1 text-[10px] leading-4 text-muted-foreground">
            unsaved
          </span>
        ) : null}
      </span>
    </button>
  )
}

export function SearchNameMatchRow({
  className,
  match,
  query,
  onOpenMatch,
}: {
  className?: string
  match: WorkspaceSearchMatch
  query: string
  onOpenMatch: (match: WorkspaceSearchMatch) => void
}) {
  const display = searchMatchDisplay(match, query)

  return (
    <button
      className={cn(
        "grid w-full grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-1.5 px-2 py-1.5 text-left outline-none hover:bg-muted/70 focus-visible:ring-1 focus-visible:ring-ring/50",
        className
      )}
      type="button"
      onClick={() => onOpenMatch(match)}
    >
      <FileTextIcon className="size-3.5 text-muted-foreground" />
      <span className="min-w-0 truncate text-xs">
        <HighlightedPreview
          preview={display.text}
          query={query}
          range={display.range}
        />
      </span>
      <span className="rounded border px-1.5 text-[10px] leading-4 text-muted-foreground">
        name
      </span>
    </button>
  )
}

function searchMatchLocation(match: WorkspaceSearchMatch) {
  if (match.kind === "name") return "name"
  if (match.line === undefined) return "match"

  return String(match.line)
}
