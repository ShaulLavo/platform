import { CaretRightIcon } from "@phosphor-icons/react"
import type { CSSProperties } from "react"

import type { WorkspaceSearchFileGroup } from "@/features/search/search-buffer-state"
import { SearchAnimatedNumber } from "@/features/search/search-animated-number"
import {
  colorForFileIcon,
  iconForEntry,
  type ResolvedFileIcon,
} from "@/lib/file-icons"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

export function SearchFileGroupHeader({
  active,
  className,
  canReplace,
  group,
  replaceVisible,
  onReplace,
  onToggle,
}: {
  active?: boolean
  className?: string
  canReplace?: boolean
  group: WorkspaceSearchFileGroup
  replaceVisible?: boolean
  onReplace?: (group: WorkspaceSearchFileGroup) => void
  onToggle: (path: string) => void
}) {
  const icon = iconForEntry({ name: group.name, type: "file" })

  return (
    <div
      className={cn(
        "grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1.5 px-2 py-1.5 text-left",
        active && "bg-muted/60",
        !active && "hover:bg-muted/55",
        className
      )}
    >
      <button
        className="grid min-w-0 grid-cols-[16px_16px_minmax(0,1fr)] items-center gap-1.5 text-left outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50"
        tabIndex={-1}
        type="button"
        onClick={() => onToggle(group.path)}
      >
        <CaretRightIcon
          className={cn(
            "size-3.5 text-muted-foreground transition-transform",
            !group.collapsed && "rotate-90"
          )}
        />
        <span
          aria-hidden="true"
          className="size-4"
          style={fileIconStyle(icon)}
        />
        <span className="min-w-0">
          <span className="block truncate text-xs font-medium">
            {group.name}
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {group.pathLabel}
          </span>
        </span>
      </button>
      <span className="rounded bg-muted/50 px-1.5 text-[10px] leading-4 text-muted-foreground">
        <SearchAnimatedNumber fontSize="10px" value={group.count} />
      </span>
      {replaceVisible ? (
        <Button
          className="h-6 px-1.5 text-[10px]"
          disabled={!canReplace}
          size="xs"
          title="Replace matches in this file"
          type="button"
          variant="ghost"
          onClick={() => onReplace?.(group)}
        >
          Replace
        </Button>
      ) : null}
    </div>
  )
}

function fileIconStyle(icon: ResolvedFileIcon): CSSProperties {
  const mask = `url(${icon.src}) center / contain no-repeat`

  return {
    backgroundColor: colorForFileIcon(icon),
    mask,
    WebkitMask: mask,
  }
}
