import {
  CircleNotchIcon,
  MagnifyingGlassIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react"
import type { ReactNode } from "react"

import type { SearchBufferSnapshot } from "@/features/search/search-buffer-state"
import { cn } from "@workspace/ui/lib/utils"

export function SearchPendingOrEmpty({
  className,
  snapshot,
}: {
  className?: string
  snapshot: SearchBufferSnapshot
}) {
  if (snapshot.status === "loading") {
    return (
      <SearchCenteredState className={className}>
        <CircleNotchIcon className="size-4 animate-spin" />
        Searching
      </SearchCenteredState>
    )
  }

  return (
    <SearchEmptyState
      className={className}
      description="Try a different query."
      title="No matches"
    />
  )
}

export function SearchEmptyState({
  className,
  description,
  title,
}: {
  className?: string
  description: string
  title: string
}) {
  return (
    <SearchCenteredState className={className}>
      <MagnifyingGlassIcon className="size-5 text-muted-foreground" />
      <span className="font-medium text-foreground">{title}</span>
      <span className="max-w-48 text-center text-[11px] text-muted-foreground">
        {description}
      </span>
    </SearchCenteredState>
  )
}

export function SearchErrorState({
  className,
  message,
}: {
  className?: string
  message: string | null
}) {
  return (
    <div className={cn("flex min-h-0 items-center justify-center p-4", className)}>
      <div className="flex max-w-52 flex-col items-center gap-3 text-center text-xs">
        <WarningCircleIcon
          className="size-6 text-destructive"
          weight="duotone"
        />
        <div>
          <div className="font-medium">Search failed</div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {message ?? "Search failed."}
          </p>
        </div>
      </div>
    </div>
  )
}

function SearchCenteredState({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex min-h-0 items-center justify-center p-4 text-xs text-muted-foreground",
        className
      )}
    >
      <div className="flex flex-col items-center gap-2">{children}</div>
    </div>
  )
}
