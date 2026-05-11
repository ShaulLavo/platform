import type { WorkspaceSearchMatch } from "@workspace/contracts"

import { HighlightedPreview } from "@/features/search/search-highlight"
import { basename } from "@/lib/path-formatters"

export function SearchMatchRow({
  match,
  query,
  onOpenMatch,
}: {
  match: WorkspaceSearchMatch
  query: string
  onOpenMatch: (match: WorkspaceSearchMatch) => void
}) {
  const location = searchMatchLocation(match)
  const preview = searchMatchPreview(match)

  return (
    <button
      className="grid w-full grid-cols-[42px_minmax(0,1fr)] gap-2 px-2 py-1.5 text-left text-xs outline-none hover:bg-muted/70 focus-visible:ring-1 focus-visible:ring-ring/50"
      type="button"
      onClick={() => onOpenMatch(match)}
    >
      <span className="text-right text-[11px] tabular-nums text-muted-foreground">
        {location}
      </span>
      <span className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate font-mono text-[11px] leading-5">
          <HighlightedPreview preview={preview} query={query} />
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

function searchMatchLocation(match: WorkspaceSearchMatch) {
  if (match.kind === "name") return "name"
  if (match.line === undefined) return "match"

  return String(match.line)
}

function searchMatchPreview(match: WorkspaceSearchMatch) {
  if (match.kind === "name") return basename(match.path)

  return match.preview || "Matched line"
}
