import { CaretRightIcon, FileTextIcon } from "@phosphor-icons/react"

import type { WorkspaceSearchFileGroup } from "@/features/search/search-buffer-state"
import { cn } from "@workspace/ui/lib/utils"

export function SearchFileGroupHeader({
  className,
  group,
  onToggle,
}: {
  className?: string
  group: WorkspaceSearchFileGroup
  onToggle: (path: string) => void
}) {
  return (
    <button
      className={cn(
        "grid w-full grid-cols-[16px_16px_minmax(0,1fr)_auto] items-center gap-1.5 border-b px-2 py-1.5 text-left outline-none hover:bg-muted/60 focus-visible:ring-1 focus-visible:ring-ring/50",
        className
      )}
      type="button"
      onClick={() => onToggle(group.path)}
    >
      <CaretRightIcon
        className={cn(
          "size-3.5 text-muted-foreground transition-transform",
          !group.collapsed && "rotate-90"
        )}
      />
      <FileTextIcon className="size-3.5 text-muted-foreground" />
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium">{group.name}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {group.pathLabel}
        </span>
      </span>
      <span className="rounded border px-1.5 text-[10px] leading-4 text-muted-foreground">
        {group.count}
      </span>
    </button>
  )
}
