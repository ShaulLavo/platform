import * as React from "react"
import {
  ArrowClockwiseIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  CaretRightIcon,
  CheckIcon,
  CircleNotchIcon,
  ClockCounterClockwiseIcon,
  FileDashedIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  HardDrivesIcon,
  HouseIcon,
  MagnifyingGlassIcon,
  ProhibitIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react"

import { fileMatchesAccept, iconForEntry } from "@/lib/file-icons"
import { fsClient, fsServerUrl } from "@/lib/fs-client"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { Separator } from "@workspace/ui/components/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

type FsEntryType = "file" | "directory" | "symlink" | "other"
type SearchScope = "current" | "system"

type FsEntry = {
  name: string
  path: string
  type: FsEntryType
  size: number
  mtimeMs: number
  birthtimeMs: number
  searchScope?: SearchScope
}

type TreeResult = {
  path: string
  entries: FsEntry[]
}

type StatResult = Omit<FsEntry, "name">

type FindMatch = {
  kind: "name" | "content"
  path: string
  type: FsEntryType
  searchScope?: SearchScope
}

type RecentResult = {
  entries: FsEntry[]
}

type ServerInfo = {
  ok: boolean
  workspaceRoot: string
  homePath: string
}

type FindErrorEvent = {
  error?: {
    message?: string
  }
}

type ParsedSseEvent = {
  event: string
  data: unknown
}

type LoadState =
  | { status: "idle" }
  | { status: "loading"; entries?: FsEntry[] }
  | { status: "ready"; entries: FsEntry[] }
  | { status: "error"; message: string }

type DirectoryFsEntry = FsEntry & {
  type: "directory"
}

export type PickedFsEntry = FsEntry & {
  type: "file" | "directory"
}

export type FilePickerMode = "folder" | "file"
export type FilePickerIconMode = "default" | "vscode"

type FilePickerDialogProps = {
  accept?: readonly string[]
  iconMode?: FilePickerIconMode
  mode?: FilePickerMode
  open: boolean
  value: PickedFsEntry | null
  onOpenChange: (open: boolean) => void
  onPick: (entry: PickedFsEntry) => void
}

const SEARCH_LIMIT = 80
const SEARCH_SCOPE_TIMEOUT_MS = 6000
const RECENT_LIMIT = 30
const ROOT_PATH = ""

function pickerCopy(mode: FilePickerMode) {
  if (mode === "file") {
    return {
      title: "Choose file",
      chooseLabel: "Choose file",
      searchLabel: "Search files",
      searchPlaceholder: "Search files",
      emptyDescription: "This folder has no visible files or folders.",
      emptyPreviewTitle: "Select a file",
      noSelectionLabel: "No file selected",
    }
  }

  return {
    title: "Choose folder",
    chooseLabel: "Choose folder",
    searchLabel: "Search files and folders",
    searchPlaceholder: "Search files and folders",
    emptyDescription: "This folder has no visible files or folders.",
    emptyPreviewTitle: "Select a folder",
    noSelectionLabel: "No folder selected",
  }
}

function listLabel(mode: FilePickerMode) {
  if (mode === "file") return "Files and folders"

  return "Folders and files"
}

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
    },
    {
      id: "documents",
      label: "Documents",
      path: joinPaths(homePath, "Documents"),
      icon: FolderOpenIcon,
    },
    {
      id: "downloads",
      label: "Downloads",
      path: joinPaths(homePath, "Downloads"),
      icon: FolderIcon,
    },
  ] as const
}

type SidebarLocation = ReturnType<typeof sidebarLocationsFor>[number]

export function FilePickerDialog({
  accept,
  iconMode = "default",
  mode = "folder",
  open,
  value,
  onOpenChange,
  onPick,
}: FilePickerDialogProps) {
  const initializedOpenRef = React.useRef(false)
  const [serverInfo, setServerInfo] = React.useState<ServerInfo | null>(null)
  const [currentPath, setCurrentPath] = React.useState(ROOT_PATH)
  const [history, setHistory] = React.useState<string[]>([])
  const [query, setQuery] = React.useState("")
  const debouncedQuery = useDebouncedValue(query, 180)
  const effectiveQuery = query.trim() ? debouncedQuery : ""
  const [selectedEntry, setSelectedEntry] = React.useState<FsEntry | null>(
    value
  )
  const [currentEntry, setCurrentEntry] =
    React.useState<DirectoryFsEntry | null>(null)
  const [reloadVersion, setReloadVersion] = React.useState(0)
  const [loadState, setLoadState] = React.useState<LoadState>({
    status: "loading",
  })
  const [recentState, setRecentState] = React.useState<LoadState>({
    status: "loading",
  })

  const initializeOpenState = React.useCallback(
    (info: ServerInfo, selectedValue: PickedFsEntry | null) => {
      if (initializedOpenRef.current) return

      initializedOpenRef.current = true
      setHistory([])
      setQuery("")
      setSelectedEntry(selectedValue)
      setCurrentEntry(null)
      setCurrentPath(initialPathForOpen(selectedValue, info.homePath))
    },
    []
  )

  React.useEffect(() => {
    if (!open) {
      initializedOpenRef.current = false
      return
    }

    const controller = new AbortController()
    void fetchServerInfo(controller.signal)
      .then((info) => {
        if (controller.signal.aborted) return

        setServerInfo(info)
        initializeOpenState(info, value)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setLoadState({ status: "error", message: errorMessage(error) })
      })

    return () => controller.abort()
  }, [initializeOpenState, open, value])

  React.useEffect(() => {
    if (!open || !serverInfo) return

    const controller = new AbortController()
    void Promise.all([
      fetchCurrentEntry(currentPath, controller.signal),
      loadEntries(
        currentPath,
        effectiveQuery,
        mode,
        controller.signal,
        (entries) => {
          if (controller.signal.aborted) return
          setLoadState({ status: "ready", entries })
        }
      ),
    ])
      .then(([current, entries]) => {
        if (controller.signal.aborted) return
        setCurrentEntry(current)
        setLoadState({ status: "ready", entries })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setLoadState({ status: "error", message: errorMessage(error) })
      })

    return () => controller.abort()
  }, [currentPath, effectiveQuery, mode, open, reloadVersion, serverInfo])

  React.useEffect(() => {
    if (!open || !serverInfo) return

    const controller = new AbortController()
    void fetchRecentEntries(controller.signal)
      .then((entries) => {
        setRecentState({ status: "ready", entries })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setRecentState({ status: "error", message: errorMessage(error) })
      })

    return () => controller.abort()
  }, [open, reloadVersion, serverInfo])

  const visibleEntries = loadStateEntries(loadState)
  const isLoadingEntries = loadState.status === "loading"
  const canGoUp = currentPath !== ROOT_PATH
  const canGoBack = history.length > 0
  const isSearching = effectiveQuery.trim().length > 0
  const previewEntry = selectedEntry ?? currentEntry
  const selectedPickable =
    toPickedEntry(selectedEntry, mode, accept) ??
    currentPickableEntry(currentEntry, mode)
  const homePath = serverInfo?.homePath ?? ROOT_PATH
  const copy = pickerCopy(mode)

  function chooseSelected() {
    if (!selectedPickable) return

    void commitPick(selectedPickable)
  }

  async function commitPick(entry: PickedFsEntry) {
    if (entry.type === "directory") await recordRecent(entry).catch(() => null)
    onPick(entry)
    onOpenChange(false)
  }

  function navigateTo(path: string) {
    if (path === currentPath) return

    moveToPath(path, true)
  }

  function goBack() {
    const previous = history.at(-1)
    if (previous === undefined) return

    setHistory((items) => items.slice(0, -1))
    setCurrentPath(previous)
    setSelectedEntry(null)
    setCurrentEntry(null)
    setLoadState(loadingLoadState)
    setQuery("")
  }

  function jumpTo(path: string) {
    if (path === currentPath) return

    moveToPath(path, true)
  }

  function moveToPath(path: string, keepHistory: boolean) {
    if (keepHistory) setHistory((items) => [...items, currentPath])
    setCurrentPath(path)
    setSelectedEntry(null)
    setCurrentEntry(null)
    setLoadState(loadingLoadState)
    setQuery("")
  }

  function refresh() {
    setLoadState(loadingLoadState)
    setReloadVersion((version) => version + 1)
  }

  function handleSearchChange(event: React.ChangeEvent<HTMLInputElement>) {
    setLoadState(loadingLoadState)
    setQuery(event.target.value)
  }

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen)
  }

  function handleListKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowDown") return selectByOffset(event, 1)
    if (event.key === "ArrowUp") return selectByOffset(event, -1)
    if (event.key === "Enter") return commitFromKeyboard(event)
    if (event.key === "ArrowRight") return enterDirectory(event)
    if (event.key === "ArrowLeft" || event.key === "Backspace") {
      return leaveDirectory(event)
    }
  }

  function selectByOffset(
    event: React.KeyboardEvent<HTMLDivElement>,
    offset: number
  ) {
    event.preventDefault()

    const pickable = visibleEntries.filter((entry) =>
      isPickableEntry(entry, mode, accept)
    )
    const nextEntry = entryByOffset(pickable, selectedEntry, offset)
    if (!nextEntry) return

    setSelectedEntry(nextEntry)
  }

  function commitFromKeyboard(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!selectedPickable) return

    event.preventDefault()
    chooseSelected()
  }

  function enterDirectory(event: React.KeyboardEvent<HTMLDivElement>) {
    if (selectedEntry?.type !== "directory") return

    event.preventDefault()
    navigateTo(selectedEntry.path)
  }

  function leaveDirectory(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!canGoUp) return

    event.preventDefault()
    navigateTo(parentPath(currentPath))
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="flex h-[min(760px,calc(100svh-2rem))] w-[min(1080px,calc(100vw-1.5rem))] max-w-none flex-col gap-0 overflow-hidden rounded-xl border bg-background p-0 text-sm shadow-2xl sm:max-w-none"
        showCloseButton={false}
      >
        <div className="border-b bg-muted/35 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <DialogHeader className="min-w-0 gap-1">
              <DialogTitle className="flex items-center gap-2 text-sm">
                <span className="flex size-7 items-center justify-center rounded-md border border-sky-200/70 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-300">
                  <HardDrivesIcon weight="duotone" />
                </span>
                {copy.title}
              </DialogTitle>
              <DialogDescription>
                Browsing your home directory.
              </DialogDescription>
            </DialogHeader>
            <div className="flex shrink-0 items-center gap-1">
              <IconTooltip label="Back">
                <Button
                  aria-label="Back"
                  disabled={!canGoBack}
                  onClick={goBack}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <ArrowLeftIcon />
                </Button>
              </IconTooltip>
              <IconTooltip label="Up one folder">
                <Button
                  aria-label="Up one folder"
                  disabled={!canGoUp}
                  onClick={() => navigateTo(parentPath(currentPath))}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <ArrowUpIcon />
                </Button>
              </IconTooltip>
              <IconTooltip label="Refresh">
                <Button
                  aria-label="Refresh"
                  onClick={refresh}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <ArrowClockwiseIcon />
                </Button>
              </IconTooltip>
            </div>
          </div>
          <div className="mt-3 grid gap-2 lg:grid-cols-[170px_minmax(0,1fr)_240px]">
            <div className="hidden lg:block" />
            <PathBar currentPath={currentPath} onNavigate={navigateTo} />
            <div className="relative">
              <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label={copy.searchLabel}
                className="h-8 pl-8"
                onChange={handleSearchChange}
                placeholder={copy.searchPlaceholder}
                value={query}
              />
            </div>
          </div>
          <MobileLocations
            currentPath={currentPath}
            homePath={homePath}
            onNavigate={jumpTo}
            recentState={recentState}
          />
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[170px_minmax(0,1fr)_240px]">
          <PlacesSidebar
            currentPath={currentPath}
            homePath={homePath}
            onNavigate={jumpTo}
            recentState={recentState}
          />
          <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]">
            <ListHeader
              isLoading={isLoadingEntries}
              isSearching={isSearching}
            />
            <FileList
              entries={visibleEntries}
              accept={accept}
              iconMode={iconMode}
              isSearching={isSearching}
              loadState={loadState}
              mode={mode}
              onKeyDown={handleListKeyDown}
              onNavigate={navigateTo}
              onRetry={refresh}
              onSelect={setSelectedEntry}
              selectedPath={selectedEntry?.path ?? null}
            />
          </div>
          <PreviewPane
            currentPath={currentPath}
            entry={previewEntry}
            iconMode={iconMode}
            isSearching={isSearching}
            mode={mode}
          />
        </div>

        <Separator />
        <DialogFooter className="grid grid-cols-1 gap-3 bg-muted/20 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <SelectedSummary
            entry={selectedPickable}
            iconMode={iconMode}
            mode={mode}
          />
          <div className="flex justify-end gap-2">
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={!selectedPickable}
              onClick={chooseSelected}
              type="button"
            >
              <CheckIcon data-icon="inline-start" />
              {copy.chooseLabel}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PlacesSidebar({
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

function LocationButton({
  currentPath,
  location,
  onNavigate,
}: {
  currentPath: string
  location: SidebarLocation
  onNavigate: (path: string) => void
}) {
  const Icon = location.icon
  const selected = currentPath === location.path

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

function RecentSidebarNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 py-1 text-xs text-muted-foreground/80">{children}</div>
  )
}

function MobileLocations({
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

function IconTooltip({
  children,
  label,
}: {
  children: React.ReactElement
  label: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function PathBar({
  currentPath,
  onNavigate,
}: {
  currentPath: string
  onNavigate: (path: string) => void
}) {
  return <Breadcrumbs currentPath={currentPath} onNavigate={onNavigate} />
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
        <React.Fragment key={crumb.path || "root"}>
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
        </React.Fragment>
      ))}
    </div>
  )
}

function ListHeader({
  isLoading,
  isSearching,
}: {
  isLoading: boolean
  isSearching: boolean
}) {
  return (
    <div className="grid h-8 grid-cols-[minmax(0,1fr)_80px_116px_74px] items-center gap-3 border-b bg-background/80 px-3 text-[11px] font-medium tracking-normal text-muted-foreground uppercase max-sm:grid-cols-[minmax(0,1fr)_68px]">
      <div className="flex min-w-0 items-center gap-2">
        <span>{isSearching ? "Matches" : "Name"}</span>
        {isLoading && <CircleNotchIcon className="size-3 animate-spin" />}
      </div>
      <div className="max-sm:text-right">Kind</div>
      <div className="max-sm:hidden">Modified</div>
      <div className="text-right max-sm:hidden">Size</div>
    </div>
  )
}

function FileList({
  accept,
  entries,
  iconMode,
  isSearching,
  loadState,
  mode,
  onKeyDown,
  onNavigate,
  onRetry,
  onSelect,
  selectedPath,
}: {
  accept?: readonly string[]
  entries: FsEntry[]
  iconMode: FilePickerIconMode
  isSearching: boolean
  loadState: LoadState
  mode: FilePickerMode
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void
  onNavigate: (path: string) => void
  onRetry: () => void
  onSelect: (entry: FsEntry) => void
  selectedPath: string | null
}) {
  if (loadState.status === "error") {
    return <ErrorState message={loadState.message} onRetry={onRetry} />
  }
  if (entries.length === 0) {
    return <EmptyState mode={mode} />
  }

  const showSearchSections = isSearching && entries.some(hasSearchScope)
  const sections = showSearchSections ? searchResultSections(entries) : []

  return (
    <ScrollArea className="min-h-0">
      <div
        aria-label={listLabel(mode)}
        className="p-1.5 outline-none"
        onKeyDown={onKeyDown}
        role="listbox"
        tabIndex={0}
      >
        {showSearchSections
          ? sections.map((section) => (
              <SearchResultSection
                key={section.scope}
                accept={accept}
                iconMode={iconMode}
                mode={mode}
                onNavigate={onNavigate}
                onSelect={onSelect}
                section={section}
                selectedPath={selectedPath}
              />
            ))
          : entries.map((entry) => (
              <FileRow
                entry={entry}
                key={entry.path}
                accept={accept}
                iconMode={iconMode}
                mode={mode}
                onNavigate={onNavigate}
                onSelect={onSelect}
                selected={entry.path === selectedPath}
                showPath={false}
              />
            ))}
      </div>
    </ScrollArea>
  )
}

function hasSearchScope(entry: FsEntry) {
  return entry.searchScope === "current" || entry.searchScope === "system"
}

function SearchResultSection({
  accept,
  iconMode,
  mode,
  onNavigate,
  onSelect,
  section,
  selectedPath,
}: {
  accept?: readonly string[]
  iconMode: FilePickerIconMode
  mode: FilePickerMode
  onNavigate: (path: string) => void
  onSelect: (entry: FsEntry) => void
  section: ReturnType<typeof searchResultSections>[number]
  selectedPath: string | null
}) {
  if (section.entries.length === 0) return null

  return (
    <div className="pb-1">
      <div className="px-2 py-1.5 text-[11px] font-medium tracking-normal text-muted-foreground uppercase">
        {section.label}
      </div>
      {section.entries.map((entry) => (
        <FileRow
          entry={entry}
          key={`${section.scope}:${entry.path}`}
          accept={accept}
          iconMode={iconMode}
          mode={mode}
          onNavigate={onNavigate}
          onSelect={onSelect}
          selected={entry.path === selectedPath}
          showPath
        />
      ))}
    </div>
  )
}

function searchResultSections(entries: FsEntry[]) {
  return [
    {
      scope: "current" as const,
      label: "Current folder",
      entries: entries.filter((entry) => entry.searchScope === "current"),
    },
    {
      scope: "system" as const,
      label: "System-wide",
      entries: entries.filter((entry) => entry.searchScope === "system"),
    },
  ]
}

function FileRow({
  accept,
  entry,
  iconMode,
  mode,
  onNavigate,
  onSelect,
  selected,
  showPath,
}: {
  accept?: readonly string[]
  entry: FsEntry
  iconMode: FilePickerIconMode
  mode: FilePickerMode
  onNavigate: (path: string) => void
  onSelect: (entry: FsEntry) => void
  selected: boolean
  showPath: boolean
}) {
  const pickable = isPickableEntry(entry, mode, accept)
  const interactive = pickable || entry.type === "directory"

  function handleDoubleClick() {
    if (entry.type === "directory") return onNavigate(entry.path)
  }

  return (
    <button
      aria-disabled={!pickable}
      aria-selected={selected}
      className={cn(
        "grid h-11 w-full grid-cols-[minmax(0,1fr)_80px_116px_74px] items-center gap-3 rounded-md px-1.5 text-left text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring/50 max-sm:grid-cols-[minmax(0,1fr)_68px]",
        "active:scale-[0.995] motion-reduce:active:scale-100",
        selected &&
          "bg-sky-50 text-sky-950 dark:bg-sky-950/35 dark:text-sky-100",
        !selected && interactive && "hover:bg-muted/70",
        !interactive && "cursor-not-allowed text-muted-foreground/60",
        interactive && !pickable && "text-muted-foreground/75"
      )}
      disabled={!interactive}
      onClick={() => onSelect(entry)}
      onDoubleClick={handleDoubleClick}
      role="option"
      type="button"
    >
      <div className="flex min-w-0 items-center gap-2">
        <EntryPreviewTile
          entry={entry}
          iconMode={iconMode}
          selected={selected}
          size="sm"
        />
        <div className="min-w-0">
          <div className="truncate font-medium">{entry.name}</div>
          <div
            className={cn(
              "truncate text-[11px] text-muted-foreground",
              !showPath && "sm:hidden"
            )}
          >
            {displayPath(entry.path)}
          </div>
        </div>
      </div>
      <KindBadge entry={entry} />
      <div className="truncate text-muted-foreground max-sm:hidden">
        {formatModified(entry.mtimeMs)}
      </div>
      <div className="text-right text-muted-foreground tabular-nums max-sm:hidden">
        {formatSizeLabel(entry)}
      </div>
    </button>
  )
}

function EntryPreviewTile({
  entry,
  iconMode,
  selected,
  size,
}: {
  entry: FsEntry
  iconMode: FilePickerIconMode
  selected: boolean
  size: "sm" | "lg"
}) {
  const large = size === "lg"
  const extension = entry.type === "file" ? fileExtension(entry.name) : ""

  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-md border shadow-xs",
        large ? "size-24" : "size-7",
        tileTone(entry, selected)
      )}
    >
      <EntryIcon
        entry={entry}
        className={large ? "size-10" : "size-4"}
        iconMode={iconMode}
        selected={selected}
      />
      {large && extension && (
        <span className="absolute right-1.5 bottom-1.5 rounded-sm bg-background/90 px-1 py-0.5 text-[10px] font-medium text-muted-foreground uppercase ring-1 ring-border">
          {extension}
        </span>
      )}
    </span>
  )
}

function EntryIcon({
  className,
  entry,
  iconMode,
  selected,
}: {
  className?: string
  entry: FsEntry
  iconMode: FilePickerIconMode
  selected: boolean
}) {
  if (iconMode === "default") {
    return (
      <DefaultEntryIcon
        className={className}
        entry={entry}
        selected={selected}
      />
    )
  }

  const icon = iconForEntry(entry)

  return (
    <img
      alt=""
      aria-hidden="true"
      className={cn("shrink-0 object-contain", className)}
      draggable={false}
      src={icon.src}
    />
  )
}

function DefaultEntryIcon({
  className,
  entry,
  selected,
}: {
  className?: string
  entry: FsEntry
  selected: boolean
}) {
  if (entry.type === "directory") {
    return (
      <FolderIcon
        className={cn(
          "shrink-0 text-amber-500",
          selected && "text-amber-600 dark:text-amber-300",
          className
        )}
        weight="duotone"
      />
    )
  }

  if (entry.type === "file") {
    return (
      <FileIcon
        className={cn(
          "shrink-0 text-sky-500",
          selected && "text-sky-600 dark:text-sky-300",
          className
        )}
        weight="duotone"
      />
    )
  }

  return (
    <FileDashedIcon
      className={cn("shrink-0 text-muted-foreground", className)}
    />
  )
}

function KindBadge({ entry }: { entry: FsEntry }) {
  if (entry.type === "directory") {
    return (
      <Badge className="justify-center border-amber-200/70 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300">
        Folder
      </Badge>
    )
  }

  if (entry.type === "file") {
    return (
      <Badge className="justify-center border-sky-200/70 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-300">
        File
      </Badge>
    )
  }

  return (
    <Badge className="justify-center" variant="outline">
      Other
    </Badge>
  )
}

function PreviewPane({
  currentPath,
  entry,
  iconMode,
  isSearching,
  mode,
}: {
  currentPath: string
  entry: FsEntry | null
  iconMode: FilePickerIconMode
  isSearching: boolean
  mode: FilePickerMode
}) {
  return (
    <aside className="hidden min-h-0 border-l bg-muted/15 lg:flex lg:flex-col">
      <div className="border-b px-3 py-2 text-[11px] font-medium tracking-normal text-muted-foreground uppercase">
        Preview
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-4">
        {entry ? (
          <EntryPreviewDetails entry={entry} iconMode={iconMode} />
        ) : (
          <NoPreview
            currentPath={currentPath}
            isSearching={isSearching}
            mode={mode}
          />
        )}
      </div>
    </aside>
  )
}

function EntryPreviewDetails({
  entry,
  iconMode,
}: {
  entry: FsEntry
  iconMode: FilePickerIconMode
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center text-center">
      <EntryPreviewTile
        entry={entry}
        iconMode={iconMode}
        selected={false}
        size="lg"
      />
      <div className="mt-3 w-full min-w-0">
        <div className="truncate text-sm font-medium">{entry.name}</div>
        <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
          {displayPath(entry.path)}
        </div>
      </div>
      <div className="mt-3">
        <KindBadge entry={entry} />
      </div>
      <Separator className="my-4" />
      <dl className="grid w-full gap-2 text-left text-xs">
        <PreviewFact label="Kind" value={kindLabel(entry)} />
        {entry.type !== "directory" && (
          <PreviewFact label="Size" value={formatSize(entry.size)} />
        )}
        <PreviewFact label="Modified" value={formatModified(entry.mtimeMs)} />
        <PreviewFact
          label="Created"
          value={formatModified(entry.birthtimeMs)}
        />
        <PreviewFact
          label="Location"
          value={displayPath(parentPath(entry.path))}
        />
      </dl>
    </div>
  )
}

function PreviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[74px_minmax(0,1fr)] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate text-foreground">{value}</dd>
    </div>
  )
}

function NoPreview({
  currentPath,
  isSearching,
  mode,
}: {
  currentPath: string
  isSearching: boolean
  mode: FilePickerMode
}) {
  const copy = pickerCopy(mode)

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-center">
      <div className="flex size-20 items-center justify-center rounded-lg border bg-background text-muted-foreground shadow-xs">
        {isSearching ? (
          <MagnifyingGlassIcon className="size-8" />
        ) : (
          <FolderOpenIcon className="size-8" weight="duotone" />
        )}
      </div>
      <div className="mt-3 text-sm font-medium">{copy.emptyPreviewTitle}</div>
      <p className="mt-1 max-w-40 text-xs text-muted-foreground">
        {`Previewing ${displayPath(currentPath)}`}
      </p>
    </div>
  )
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div className="flex min-h-80 items-center justify-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <WarningCircleIcon
          className="size-8 text-destructive"
          weight="duotone"
        />
        <div>
          <div className="font-medium">Could not load this folder</div>
          <p className="mt-1 text-xs text-muted-foreground">{message}</p>
        </div>
        <Button onClick={onRetry} size="sm" type="button" variant="outline">
          <ArrowClockwiseIcon data-icon="inline-start" />
          Retry
        </Button>
      </div>
    </div>
  )
}

function EmptyState({ mode }: { mode: FilePickerMode }) {
  const copy = pickerCopy(mode)

  return (
    <div className="flex min-h-80 items-center justify-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <FolderOpenIcon
          className="size-8 text-muted-foreground"
          weight="duotone"
        />
        <div>
          <div className="font-medium">Nothing here</div>
          <p className="mt-1 text-xs text-muted-foreground">
            {copy.emptyDescription}
          </p>
        </div>
      </div>
    </div>
  )
}

function SelectedSummary({
  entry,
  iconMode,
  mode,
}: {
  entry: PickedFsEntry | null
  iconMode: FilePickerIconMode
  mode: FilePickerMode
}) {
  const copy = pickerCopy(mode)

  if (!entry) {
    return (
      <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <ProhibitIcon className="size-4 shrink-0" />
        {copy.noSelectionLabel}
      </div>
    )
  }

  return (
    <div className="flex min-w-0 items-center gap-2 text-xs">
      <EntryIcon
        className="size-4"
        entry={entry}
        iconMode={iconMode}
        selected={false}
      />
      <div className="min-w-0">
        <div className="truncate font-medium">{entry.name}</div>
        <div className="truncate text-muted-foreground">
          {displayPath(entry.path)}
        </div>
      </div>
    </div>
  )
}

async function loadEntries(
  path: string,
  query: string,
  mode: FilePickerMode,
  signal: AbortSignal,
  onEntries: (entries: FsEntry[]) => void
) {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) return fetchTreeEntries(path, signal)

  return streamFindEntries(path, trimmedQuery, mode, signal, onEntries)
}

async function fetchServerInfo(signal: AbortSignal) {
  const response = await fsClient.health.get({
    fetch: { signal },
  })

  if (response.error) throw new Error(rpcErrorMessage(response.error))

  return response.data as ServerInfo
}

async function fetchCurrentEntry(path: string, signal: AbortSignal) {
  const entry = await fetchJson<StatResult>(fsUrl("/fs/stat", { path }), signal)
  if (entry.type !== "directory") {
    throw new Error("The current path is not a folder.")
  }

  return {
    ...entry,
    name: basename(entry.path),
    type: entry.type,
  }
}

async function fetchTreeEntries(path: string, signal: AbortSignal) {
  const result = await fetchJson<TreeResult>(
    fsUrl("/fs/tree", { depth: "1", path }),
    signal
  )

  return result.entries
}

async function fetchRecentEntries(signal: AbortSignal) {
  const response = await fsClient.fs.recents.get({
    query: { limit: RECENT_LIMIT },
    fetch: { signal },
  })

  if (response.error) throw new Error(rpcErrorMessage(response.error))

  return (response.data as RecentResult).entries
}

async function recordRecent(entry: PickedFsEntry) {
  const response = await fsClient.fs.recents.post({ path: entry.path })
  if (response.error) throw new Error(rpcErrorMessage(response.error))
}

async function streamFindEntries(
  path: string,
  query: string,
  mode: FilePickerMode,
  signal: AbortSignal,
  onEntries: (entries: FsEntry[]) => void
) {
  const matches: FindMatch[] = []
  const seenPaths = new Set<string>()

  await streamFindScope(
    path,
    query,
    mode,
    "current",
    matches,
    seenPaths,
    signal,
    SEARCH_SCOPE_TIMEOUT_MS,
    () => {
      onEntries(fallbackEntries(matches))
    }
  )

  if (path !== ROOT_PATH) {
    await streamFindScope(
      ROOT_PATH,
      query,
      mode,
      "system",
      matches,
      seenPaths,
      signal,
      SEARCH_SCOPE_TIMEOUT_MS,
      () => {
        onEntries(fallbackEntries(matches))
      }
    )
  }

  return hydrateMatches(matches, signal)
}

async function streamFindScope(
  path: string,
  query: string,
  mode: FilePickerMode,
  scope: SearchScope,
  matches: FindMatch[],
  seenPaths: Set<string>,
  signal: AbortSignal,
  timeoutMs: number | null,
  onMatch: () => void
) {
  const scopedSignal = scopedSearchSignal(signal, timeoutMs)

  try {
    for await (const event of streamFindEvents(
      path,
      query,
      mode,
      scopedSignal
    )) {
      if (appendFindMatch(event, matches, seenPaths, scope)) {
        onMatch()
        continue
      }

      if (event.event === "error") throw new Error(findEventError(event.data))
      if (event.event === "done") return
    }
  } catch (error) {
    if (scopedSignal.aborted) return
    throw error
  } finally {
    cleanupSearchSignal(scopedSignal)
  }
}

function appendFindMatch(
  event: ParsedSseEvent,
  matches: FindMatch[],
  seenPaths: Set<string>,
  scope: SearchScope
) {
  if (event.event !== "match") return false

  const match = findEventMatch(event.data)
  if (!match) return false
  if (seenPaths.has(match.path)) return false

  seenPaths.add(match.path)
  matches.push({ ...match, searchScope: scope })
  return true
}

async function hydrateMatches(matches: FindMatch[], signal: AbortSignal) {
  const folders = unique(matches.map((match) => parentPath(match.path)))
  const entriesByPath = new Map<string, FsEntry>()

  await Promise.all(
    folders.map(async (folder) => {
      const entries = await fetchTreeEntries(folder, signal)
      for (const entry of entries) entriesByPath.set(entry.path, entry)
    })
  )

  return matches
    .map((match) => hydratedEntry(match, entriesByPath))
    .sort(compareEntries)
}

function hydratedEntry(match: FindMatch, entriesByPath: Map<string, FsEntry>) {
  const entry = entriesByPath.get(match.path) ?? fallbackEntry(match)
  return { ...entry, searchScope: match.searchScope }
}

function fallbackEntry(match: FindMatch): FsEntry {
  return {
    name: basename(match.path),
    path: match.path,
    type: match.type,
    size: 0,
    mtimeMs: 0,
    birthtimeMs: 0,
    searchScope: match.searchScope,
  }
}

async function* streamFindEvents(
  path: string,
  query: string,
  mode: FilePickerMode,
  signal: AbortSignal
): AsyncGenerator<ParsedSseEvent> {
  const response = await fetch(findEventsUrl(path, query, mode), { signal })
  if (!response.ok)
    throw new Error(`Search failed with status ${response.status}`)
  if (!response.body) throw new Error("Search response did not include a body.")

  yield* parseSseStream(response.body)
}

function findEventsUrl(path: string, query: string, mode: FilePickerMode) {
  return fsUrl("/fs/find/events", {
    entryType: searchEntryType(mode),
    includeContent: "false",
    limit: String(SEARCH_LIMIT),
    path,
    query,
  })
}

function searchEntryType(mode: FilePickerMode) {
  if (mode === "folder") return "directory"

  return undefined
}

async function fetchJson<T>(url: URL, signal: AbortSignal) {
  const response = await fetch(url, { signal })
  const payload = await response.json().catch(() => null)

  if (!response.ok) throw new Error(rawRpcErrorMessage(payload))

  return payload as T
}

function fsUrl(pathname: string, params: Record<string, string | undefined>) {
  const url = new URL(pathname, fsServerUrl)
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue
    url.searchParams.set(key, value)
  }

  return url
}

function scopedSearchSignal(signal: AbortSignal, timeoutMs: number | null) {
  if (timeoutMs === null) return signal

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  const abort = () => controller.abort()
  signal.addEventListener("abort", abort, { once: true })
  searchSignalCleanup.set(controller.signal, () => {
    window.clearTimeout(timeout)
    signal.removeEventListener("abort", abort)
  })

  return controller.signal
}

const searchSignalCleanup = new WeakMap<AbortSignal, () => void>()

function cleanupSearchSignal(signal: AbortSignal) {
  const cleanup = searchSignalCleanup.get(signal)
  if (!cleanup) return

  cleanup()
  searchSignalCleanup.delete(signal)
}

async function* parseSseStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<ParsedSseEvent> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()

  try {
    yield* readSseChunks(reader, decoder)
  } finally {
    reader.releaseLock()
  }
}

async function* readSseChunks(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder
): AsyncGenerator<ParsedSseEvent> {
  let buffered = ""

  while (true) {
    const result = await reader.read()
    if (result.done) break

    buffered = yield* yieldParsedSseEvents(
      buffered + decoder.decode(result.value, { stream: true })
    )
  }

  buffered += decoder.decode()
  yield* yieldParsedSseEvents(buffered)
}

function* yieldParsedSseEvents(buffered: string) {
  const parsed = parseBufferedSseEvents(buffered)
  for (const event of parsed.events) yield event
  return parsed.buffered
}

function fallbackEntries(matches: FindMatch[]) {
  return matches.map(fallbackEntry).sort(compareEntries)
}

function parseBufferedSseEvents(buffered: string) {
  const events: ParsedSseEvent[] = []
  let remaining = buffered
  let separator = sseSeparatorIndex(remaining)

  while (separator >= 0) {
    const raw = remaining.slice(0, separator)
    remaining = remaining.slice(
      separator + sseSeparatorLength(remaining, separator)
    )
    const event = parseSseEvent(raw)
    if (event) events.push(event)
    separator = sseSeparatorIndex(remaining)
  }

  return { events, buffered: remaining }
}

function sseSeparatorIndex(input: string) {
  const unix = input.indexOf("\n\n")
  const windows = input.indexOf("\r\n\r\n")
  if (unix < 0) return windows
  if (windows < 0) return unix

  return Math.min(unix, windows)
}

function sseSeparatorLength(input: string, index: number) {
  return input.startsWith("\r\n\r\n", index) ? 4 : 2
}

function parseSseEvent(raw: string): ParsedSseEvent | null {
  let event = "message"
  const data: string[] = []

  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("event:")) event = line.slice(6).trim()
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart())
  }

  if (data.length === 0) return null

  return {
    event,
    data: parseSseData(data.join("\n")),
  }
}

function parseSseData(data: string) {
  try {
    return JSON.parse(data) as unknown
  } catch {
    return data
  }
}

function findEventMatch(data: unknown): FindMatch | null {
  if (!data || typeof data !== "object") return null
  if (!("match" in data)) return null
  if (!isFindMatch(data.match)) return null

  return data.match
}

function isFindMatch(match: unknown): match is FindMatch {
  if (!match || typeof match !== "object") return false
  if (!("kind" in match) || match.kind !== "name") return false
  if (!("path" in match) || typeof match.path !== "string") return false
  if (!("type" in match) || !isFsEntryType(match.type)) return false

  return true
}

function isFsEntryType(type: unknown): type is FsEntryType {
  return (
    type === "file" ||
    type === "directory" ||
    type === "symlink" ||
    type === "other"
  )
}

function findEventError(data: unknown) {
  if (!data || typeof data !== "object") return "Search failed."

  const payload = data as FindErrorEvent
  return payload.error?.message ?? "Search failed."
}

function entryByOffset(
  entries: FsEntry[],
  selectedEntry: FsEntry | null,
  offset: number
) {
  if (entries.length === 0) return null

  const currentIndex = entries.findIndex(
    (entry) => entry.path === selectedEntry?.path
  )
  const nextIndex = nextSelectionIndex(currentIndex, offset, entries.length)
  return entries[nextIndex] ?? null
}

function nextSelectionIndex(
  currentIndex: number,
  offset: number,
  length: number
) {
  if (currentIndex < 0 && offset > 0) return 0
  if (currentIndex < 0) return length - 1

  return Math.min(Math.max(currentIndex + offset, 0), length - 1)
}

function toPickedEntry(
  entry: FsEntry | null,
  mode: FilePickerMode,
  accept?: readonly string[]
): PickedFsEntry | null {
  if (!entry) return null
  if (!isPickableEntry(entry, mode, accept)) return null

  return entry
}

function currentPickableEntry(
  entry: DirectoryFsEntry | null,
  mode: FilePickerMode
): PickedFsEntry | null {
  if (mode !== "folder") return null

  return entry
}

function isPickableEntry(
  entry: FsEntry,
  mode: FilePickerMode,
  accept?: readonly string[]
): entry is PickedFsEntry {
  if (mode === "folder") return entry.type === "directory"
  if (entry.type !== "file") return false

  return fileMatchesAccept(entry.name, accept)
}

function parentPath(path: string) {
  const parts = path.split("/").filter(Boolean)
  parts.pop()

  return parts.join("/")
}

function basename(path: string) {
  const parts = path.split("/").filter(Boolean)
  return parts.at(-1) ?? "Root"
}

function pathCrumbs(path: string) {
  const parts = path.split("/").filter(Boolean)
  const crumbs = [{ label: "Root", path: ROOT_PATH }]
  let current = ROOT_PATH

  for (const part of parts) {
    current = current ? `${current}/${part}` : part
    crumbs.push({ label: part, path: current })
  }

  return crumbs
}

function initialPathForOpen(
  selectedValue: PickedFsEntry | null,
  homePath: string
) {
  if (!selectedValue) return homePath

  return parentPath(selectedValue.path)
}

function joinPaths(parent: string, child: string) {
  if (!parent) return child

  return `${parent}/${child}`
}

function displayPath(path: string) {
  if (!path) return "/"

  return `/${path}`
}

function compareEntries(a: FsEntry, b: FsEntry) {
  if (a.type === "directory" && b.type !== "directory") return -1
  if (a.type !== "directory" && b.type === "directory") return 1

  return a.name.localeCompare(b.name)
}

function tileTone(entry: FsEntry, selected: boolean) {
  if (entry.type === "directory") {
    return cn(
      "border-amber-200/70 bg-amber-50 text-amber-600 dark:border-amber-900/70 dark:bg-amber-950/30",
      selected && "border-amber-300 bg-amber-100 dark:border-amber-800"
    )
  }

  if (entry.type === "file") {
    return cn(
      "border-sky-200/70 bg-sky-50 text-sky-600 dark:border-sky-900/70 dark:bg-sky-950/30",
      selected && "border-sky-300 bg-sky-100 dark:border-sky-800"
    )
  }

  return "border-border bg-muted/30 text-muted-foreground"
}

function kindLabel(entry: FsEntry) {
  if (entry.type === "directory") return "Folder"
  if (entry.type === "file") return "File"
  if (entry.type === "symlink") return "Alias"

  return "Other"
}

function fileExtension(name: string) {
  const index = name.lastIndexOf(".")
  if (index <= 0) return ""
  if (index === name.length - 1) return ""

  return name.slice(index + 1, index + 5)
}

function formatSizeLabel(entry: FsEntry) {
  if (entry.type === "directory") return ""

  return formatSize(entry.size)
}

function formatSize(size: number) {
  if (size === 0) return "0 B"

  const units = ["B", "KB", "MB", "GB"]
  const exponent = Math.min(Math.floor(Math.log(size) / Math.log(1024)), 3)
  const value = size / 1024 ** exponent
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

function formatModified(mtimeMs: number) {
  if (mtimeMs <= 0) return "Unknown"

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(mtimeMs))
}

function unique(values: string[]) {
  return Array.from(new Set(values))
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return "The file server did not return a usable response."
}

function rpcErrorMessage(error: unknown) {
  const value = errorValue(error)
  if (isErrorPayload(value)) return value.error.message

  return "The file server rejected the request."
}

function rawRpcErrorMessage(payload: unknown) {
  if (isErrorPayload(payload)) return payload.error.message

  return "The file server rejected the request."
}

function loadStateEntries(state: LoadState) {
  if (state.status === "ready") return state.entries
  if (state.status === "loading") return state.entries ?? []

  return []
}

function loadingLoadState(previous: LoadState): LoadState {
  const entries = loadStateEntries(previous)
  if (entries.length === 0) return { status: "loading" }

  return { status: "loading", entries }
}

function errorValue(error: unknown) {
  if (!error || typeof error !== "object") return null
  if (!("value" in error)) return null

  return error.value
}

function isErrorPayload(
  value: unknown
): value is { error: { message: string } } {
  if (!value || typeof value !== "object") return false
  if (!("error" in value)) return false

  const error = value.error
  if (!error || typeof error !== "object") return false
  return "message" in error && typeof error.message === "string"
}

function useDebouncedValue(value: string, delay: number) {
  const [debounced, setDebounced] = React.useState(value)

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [delay, value])

  return debounced
}
