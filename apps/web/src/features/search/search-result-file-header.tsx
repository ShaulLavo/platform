import { CaretRightIcon } from "@phosphor-icons/react"
import { useMemo } from "react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { SearchAnimatedNumber } from "@/features/search/search-animated-number"
import {
  fileIconStyle,
  fileName,
  matchNoun,
} from "@/features/search/search-result-editor-utils"
import type { SearchResultFileBlock } from "@/features/search/search-result-view-model"
import { iconForEntry } from "@/lib/file-icons"

export function SearchResultFileHeader({
  active,
  canReplace,
  file,
  replaceVisible,
  onReplace,
  onToggle,
}: {
  active: boolean
  canReplace?: boolean
  file: SearchResultFileBlock
  replaceVisible: boolean
  onReplace: () => void
  onToggle: () => void
}) {
  const name = fileName(file.path)
  const icon = useMemo(() => iconForEntry({ name, type: "file" }), [name])

  return (
    <div
      className={cn(
        "grid w-full grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-1.5 rounded-sm border-l border-transparent px-2 py-1.5 text-left",
        active &&
          "bg-muted/70 shadow-[inset_0_1px_0_color-mix(in_oklch,var(--border)_55%,transparent)]",
        !active && "hover:bg-muted/45"
      )}
    >
      <button
        aria-label={
          file.collapsed ? "Expand file results" : "Collapse file results"
        }
        className="grid size-5 place-items-center rounded-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50"
        disabled={file.excerpts.length === 0}
        tabIndex={-1}
        type="button"
        onClick={onToggle}
      >
        <CaretRightIcon
          className={cn(
            "size-3.5 transition-transform",
            !file.collapsed && file.excerpts.length > 0 && "rotate-90"
          )}
        />
      </button>
      <div
        className="grid min-w-0 grid-cols-[16px_minmax(0,1fr)] items-center gap-1.5 text-left"
        title={file.path}
      >
        <span
          aria-hidden="true"
          className="size-4"
          style={fileIconStyle(icon)}
        />
        <span className="min-w-0">
          <span className="block truncate text-xs font-medium">{name}</span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {file.pathLabel}
          </span>
        </span>
      </div>
      <span className="rounded-sm bg-muted/55 px-1.5 text-[10px] leading-4 text-muted-foreground">
        <SearchAnimatedNumber fontSize="10px" value={file.matchCount} />{" "}
        {matchNoun(file.matchCount)}
      </span>
      {replaceVisible ? (
        <Button
          className="h-6 px-1.5 text-[10px]"
          disabled={!canReplace}
          size="xs"
          title="Replace matches in this file"
          type="button"
          variant="ghost"
          onClick={onReplace}
        >
          Replace
        </Button>
      ) : null}
    </div>
  )
}
