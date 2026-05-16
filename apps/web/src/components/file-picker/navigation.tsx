import type { FsEntry } from "@/lib/file-system-types"
import {
  CaretRightIcon,
  CircleNotchIcon,
  ClockCounterClockwiseIcon,
  FolderIcon,
  FolderOpenIcon,
  HardDrivesIcon,
  HouseIcon,
} from "@phosphor-icons/react"
import { Separator } from "@workspace/ui/components/separator"
import { cn } from "@workspace/ui/lib/utils"
import { Fragment, type ReactNode } from "react"

import { EntryIcon } from "./entry-ui"
import { ROOT_PATH, joinPaths, pathCrumbs, type LoadState } from "./state"

function sidebarLocationsFor(homePath: string) {
  return [
    {
      id: "root",
      label: "Root",
      path: ROOT_PATH,
      icon: HardDrivesIcon,
    },
    {
      id: "home",
      label: "Home",
      path: homePath,
      icon: HouseIcon,
    },
    {
      id: "desktop",
      label: "Desktop",
      path: joinPaths(homePath, "Desktop"),
      icon: FolderIcon,
      openIcon: FolderOpenIcon,
    },
    {
      id: "documents",
      label: "Documents",
      path: joinPaths(homePath, "Documents"),
      icon: FolderIcon,
      openIcon: FolderOpenIcon,
    },
    {
      id: "downloads",
      label: "Downloads",
      path: joinPaths(homePath, "Downloads"),
      icon: FolderIcon,
      openIcon: FolderOpenIcon,
    },
  ] as const
}

type SidebarLocation = ReturnType<typeof sidebarLocationsFor>[number]

export function PlacesSidebar({
  currentPath,
  homePath,
  onNavigate,
  recentState,
}: {
  currentPath: string
  homePath: string
  onNavigate: (path: string) => void
  recentState: LoadState
}) {
  const locations = sidebarLocationsFor(homePath)

  return (
    <aside className="hidden min-h-0 border-r bg-muted/25 p-2 lg:block">
      <div className="mb-1 px-2 py-1 text-[11px] font-medium tracking-normal text-muted-foreground uppercase">
        Locations
      </div>
      <div className="space-y-0.5">
        {locations.map((location) => (
          <LocationButton
            currentPath={currentPath}
            key={location.id}
            location={location}
            onNavigate={onNavigate}
          />
        ))}
      </div>
      <Separator className="my-2" />
      <RecentSidebarSection
        currentPath={currentPath}
        onNavigate={onNavigate}
        state={recentState}
      />
    </aside>
  )
}

export function MobileLocations({
  currentPath,
  homePath,
  onNavigate,
  recentState,
}: {
  currentPath: string
  homePath: string
  onNavigate: (path: string) => void
  recentState: LoadState
}) {
  const locations = sidebarLocationsFor(homePath)
  const recents = recentState.status === "ready" ? recentState.entries : []

  return (
    <div className="mt-2 space-y-1 lg:hidden">
      <div className="flex gap-1 overflow-x-auto pb-0.5">
        {locations.map((location) => (
          <LocationPill
            currentPath={currentPath}
            key={location.id}
            location={location}
            onNavigate={onNavigate}
          />
        ))}
      </div>
      {recents.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
          <span className="shrink-0 px-1 text-[11px] font-medium text-muted-foreground uppercase">
            Recent
          </span>
          {recents.map((entry) => (
            <RecentPill
              currentPath={currentPath}
              entry={entry}
              key={entry.path}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function PathBar({
  currentPath,
  onNavigate,
}: {
  currentPath: string
  onNavigate: (path: string) => void
}) {
  return <Breadcrumbs currentPath={currentPath} onNavigate={onNavigate} />
}

function LocationButton({
  currentPath,
  location,
  onNavigate,
}: {
  currentPath: string
  location: SidebarLocation
  onNavigate: (path: string) => void
}) {
  const selected = currentPath === location.path
  const Icon =
    selected && "openIcon" in location ? location.openIcon : location.icon

  return (
    <button
      aria-current={selected ? "page" : undefined}
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs transition-[background-color,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] outline-none focus-visible:ring-1 focus-visible:ring-ring/50",
        selected &&
          "bg-sky-100 text-sky-950 dark:bg-sky-950/50 dark:text-sky-100",
        !selected &&
          "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
      onClick={() => onNavigate(location.path)}
      type="button"
    >
      <Icon
        className={cn(
          "size-4 shrink-0",
          selected ? "text-sky-600 dark:text-sky-300" : "text-muted-foreground"
        )}
        weight="duotone"
      />
      <span className="truncate">{location.label}</span>
    </button>
  )
}

function RecentSidebarSection({
  currentPath,
  onNavigate,
  state,
}: {
  currentPath: string
  onNavigate: (path: string) => void
  state: LoadState
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium tracking-normal text-muted-foreground uppercase">
        <ClockCounterClockwiseIcon className="size-3.5" />
        Recent
      </div>
      <RecentShortcutList
        currentPath={currentPath}
        onNavigate={onNavigate}
        state={state}
      />
    </div>
  )
}

function RecentShortcutList({
  currentPath,
  onNavigate,
  state,
}: {
  currentPath: string
  onNavigate: (path: string) => void
  state: LoadState
}) {
  if (state.status === "loading") return <RecentShortcutLoading />
  if (state.status === "error")
    return <RecentSidebarNote>Could not load</RecentSidebarNote>
  if (state.status === "ready" && state.entries.length === 0) {
    return <RecentSidebarNote>No folders yet</RecentSidebarNote>
  }

  const entries = state.status === "ready" ? state.entries : []

  return (
    <div className="space-y-0.5">
      {entries.map((entry) => (
        <RecentShortcut
          currentPath={currentPath}
          entry={entry}
          key={entry.path}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  )
}

function RecentShortcut({
  currentPath,
  entry,
  onNavigate,
}: {
  currentPath: string
  entry: FsEntry
  onNavigate: (path: string) => void
}) {
  const selected = currentPath === entry.path

  return (
    <button
      aria-current={selected ? "page" : undefined}
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs transition-[background-color,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] outline-none focus-visible:ring-1 focus-visible:ring-ring/50",
        selected &&
          "bg-sky-100 text-sky-950 dark:bg-sky-950/50 dark:text-sky-100",
        !selected &&
          "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
      onClick={() => onNavigate(entry.path)}
      type="button"
    >
      <EntryIcon
        className="size-4"
        entry={entry}
        iconMode="default"
        selected={selected}
      />
      <span className="truncate">{entry.name}</span>
    </button>
  )
}

function RecentShortcutLoading() {
  return (
    <div className="px-2 py-1">
      <div className="flex h-6 items-center gap-2 text-xs text-muted-foreground/80">
        <CircleNotchIcon className="size-3.5 animate-spin" />
        Loading
      </div>
    </div>
  )
}

function RecentSidebarNote({ children }: { children: ReactNode }) {
  return (
    <div className="px-2 py-1 text-xs text-muted-foreground/80">{children}</div>
  )
}

function LocationPill({
  currentPath,
  location,
  onNavigate,
}: {
  currentPath: string
  location: SidebarLocation
  onNavigate: (path: string) => void
}) {
  const selected = currentPath === location.path

  return (
    <button
      aria-current={selected ? "page" : undefined}
      className={cn(
        "h-7 shrink-0 rounded-md border px-2 text-xs transition-[background-color,color,border-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] outline-none focus-visible:ring-1 focus-visible:ring-ring/50 active:scale-[0.98] motion-reduce:active:scale-100",
        selected &&
          "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-100",
        !selected && "border-transparent bg-muted/50 text-muted-foreground"
      )}
      onClick={() => onNavigate(location.path)}
      type="button"
    >
      {location.label}
    </button>
  )
}

function RecentPill({
  currentPath,
  entry,
  onNavigate,
}: {
  currentPath: string
  entry: FsEntry
  onNavigate: (path: string) => void
}) {
  const selected = currentPath === entry.path

  return (
    <button
      aria-current={selected ? "page" : undefined}
      className={cn(
        "h-7 shrink-0 rounded-md border px-2 text-xs transition-[background-color,color,border-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] outline-none focus-visible:ring-1 focus-visible:ring-ring/50 active:scale-[0.98] motion-reduce:active:scale-100",
        selected &&
          "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-100",
        !selected && "border-transparent bg-muted/50 text-muted-foreground"
      )}
      onClick={() => onNavigate(entry.path)}
      type="button"
    >
      {entry.name}
    </button>
  )
}

function Breadcrumbs({
  currentPath,
  onNavigate,
}: {
  currentPath: string
  onNavigate: (path: string) => void
}) {
  const crumbs = pathCrumbs(currentPath)

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-xs">
      {crumbs.map((crumb, index) => (
        <Fragment key={crumb.path || "root"}>
          {index > 0 && (
            <CaretRightIcon className="size-3 shrink-0 text-muted-foreground" />
          )}
          <button
            className={cn(
              "min-w-0 shrink truncate rounded-sm px-1.5 py-1 text-muted-foreground transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] outline-none hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50",
              crumb.path === currentPath && "text-foreground"
            )}
            onClick={() => onNavigate(crumb.path)}
            type="button"
          >
            {crumb.label}
          </button>
        </Fragment>
      ))}
    </div>
  )
}
