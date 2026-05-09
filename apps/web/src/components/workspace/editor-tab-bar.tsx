import { ColumnsIcon, FileIcon, RowsIcon, XIcon } from "@phosphor-icons/react"
import {
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react"

import {
  nextEditorDiffViewMode,
  type EditorDiffViewMode,
} from "@/features/editor/utils/diff-view-mode"
import { useEditorCommands } from "@/features/editor/state/editor-commands"
import { useEditorDocumentState } from "@/features/editor/state/editor-document-state"
import { useEditorWorkspaceState } from "@/features/editor/state/editor-workspace-state"
import { useWorkspaceFocus } from "@/components/workspace/workspace-focus-state"
import {
  diffDocumentLabel,
  diffDocumentShortHash,
  diffDocumentTitle,
  parseDiffDocumentId,
} from "@/features/git/diff-document"
import { useStatus } from "@/features/git/hooks"
import {
  gitStatusSymbol,
  type GitSymbolSource,
} from "@/features/git/status-symbols"
import type { FileStatus } from "@/features/git/types"
import {
  colorForFileIcon,
  iconForEntry,
  type ResolvedFileIcon,
} from "@/lib/file-icons"
import { basename, displayPath } from "@/lib/path-formatters"
import { Button } from "@workspace/ui/components/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

export type EditorTabSizing = "fit" | "fixed" | "shrink"

const DEFAULT_EDITOR_TAB_SIZING: EditorTabSizing = "fit"

export function EditorTabBar({
  diffViewMode = null,
  onDiffViewModeChange,
  rootPath,
  tabSizing = DEFAULT_EDITOR_TAB_SIZING,
}: {
  diffViewMode?: EditorDiffViewMode | null
  onDiffViewModeChange?: (mode: EditorDiffViewMode) => void
  rootPath: string
  tabSizing?: EditorTabSizing
}) {
  const selectedTabRef = useRef<HTMLDivElement>(null)
  const tabListRef = useRef<HTMLDivElement>(null)
  const dirtyFilePaths = useEditorDocumentState((state) => state.dirtyFilePaths)
  const openFilePaths = useEditorWorkspaceState((state) => state.openFilePaths)
  const selectedFilePath = useEditorWorkspaceState(
    (state) => state.selectedFilePath
  )
  const selectedDiff = parseDiffDocumentId(selectedFilePath)
  const { closeTab, selectFile } = useEditorCommands()
  const requestEditorFocus = useWorkspaceFocus(
    (state) => state.requestEditorFocus
  )
  const gitStatus = useStatus(rootPath)
  const gitFiles = gitStatus.data?.files ?? EMPTY_GIT_FILES

  useLayoutEffect(() => {
    if (!selectedFilePath) return

    scrollSelectedTabIntoView(tabListRef.current, selectedTabRef.current)
  }, [selectedFilePath])

  if (openFilePaths.length === 0) return null

  function handleSelectTab(path: string) {
    selectFile(path)
    requestEditorFocus()
  }

  return (
    <nav
      aria-label="Open files"
      className="flex h-10 min-w-0 shrink-0 border-b bg-muted/30"
    >
      <div
        className="app-scrollbar-thin flex min-w-0 flex-1 overflow-x-auto"
        ref={tabListRef}
        role="tablist"
      >
        <div className="flex min-w-full flex-1 items-end">
          {openFilePaths.map((path) => {
            const active = path === selectedFilePath
            const dirty = dirtyFilePaths.has(path)
            const name = tabName(path)
            const icon = iconForEntry({ name: iconName(path), type: "file" })
            const showCloseIcon = active && !dirty
            const diffStatus = tabDiffStatus(path, gitFiles, rootPath)
            const diffHash = diffDocumentShortHash(path)
            const diffSuffix = tabDiffSuffix(diffHash, diffStatus?.label)

            return (
              <div
                className={cn(
                  "group flex h-10 items-center border-r border-border bg-background/40 text-xs",
                  tabSizingClassName(tabSizing),
                  active &&
                    "border-t-2 border-t-foreground bg-background text-foreground"
                )}
                key={path}
                ref={active ? selectedTabRef : undefined}
              >
                <button
                  aria-selected={active}
                  className={cn(
                    "flex h-full min-w-0 flex-1 items-center gap-2 px-3 text-left text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50",
                    active && "text-foreground"
                  )}
                  onClick={() => handleSelectTab(path)}
                  role="tab"
                  title={tabTitle(path)}
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className="size-3.5 shrink-0 object-contain"
                    style={fileIconStyle(icon)}
                  />
                  <span className="truncate">{name}</span>
                  {diffSuffix ? (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "shrink-0 text-xs leading-none font-semibold tabular-nums",
                        diffStatus?.className ?? "text-muted-foreground"
                      )}
                      title={diffStatus?.title}
                    >
                      {diffSuffix}
                    </span>
                  ) : null}
                </button>
                <button
                  aria-label={`Close ${name}`}
                  className={cn(
                    "group/close relative mr-1 flex size-6 shrink-0 items-center justify-center text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50",
                    showCloseIcon || dirty
                      ? "opacity-100"
                      : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  )}
                  onClick={() => closeTab(path)}
                  title={`Close ${name}`}
                  type="button"
                >
                  <XIcon
                    className={cn(
                      "size-3 transition-opacity",
                      showCloseIcon
                        ? "opacity-70"
                        : "opacity-0 group-hover:opacity-70 group-focus-visible/close:opacity-70"
                    )}
                  />
                  {dirty && (
                    <span
                      aria-hidden="true"
                      className="absolute size-2 rounded-full bg-amber-500 transition-opacity group-hover:opacity-0 group-focus-visible/close:opacity-0"
                    />
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </div>
      {diffViewMode && onDiffViewModeChange && selectedDiff ? (
        <DiffTabActions
          diffPath={selectedDiff.path}
          mode={diffViewMode}
          onModeChange={onDiffViewModeChange}
          onOpenFile={handleSelectTab}
        />
      ) : null}
    </nav>
  )
}

function DiffTabActions({
  diffPath,
  mode,
  onModeChange,
  onOpenFile,
}: {
  diffPath: string
  mode: EditorDiffViewMode
  onModeChange: (mode: EditorDiffViewMode) => void
  onOpenFile: (path: string) => void
}) {
  return (
    <div className="flex h-full shrink-0 items-center gap-0.5 border-l bg-background/40 px-1">
      <OpenOriginalFileButton path={diffPath} onOpenFile={onOpenFile} />
      <DiffViewModeToggle mode={mode} onModeChange={onModeChange} />
    </div>
  )
}

function OpenOriginalFileButton({
  path,
  onOpenFile,
}: {
  path: string
  onOpenFile: (path: string) => void
}) {
  const label = `Open original file: ${displayPath(path)}`

  function handleClick() {
    onOpenFile(path)
  }

  return (
    <ToolbarIconButton label={label} onClick={handleClick}>
      <FileIcon className="size-3.5" />
    </ToolbarIconButton>
  )
}

function DiffViewModeToggle({
  mode,
  onModeChange,
}: {
  mode: EditorDiffViewMode
  onModeChange: (mode: EditorDiffViewMode) => void
}) {
  const nextMode = nextEditorDiffViewMode(mode)
  const label = `Switch to ${nextMode} diff view`

  function handleClick() {
    onModeChange(nextMode)
  }

  return (
    <ToolbarIconButton label={label} onClick={handleClick}>
      <DiffViewModeToggleIcon mode={nextMode} />
    </ToolbarIconButton>
  )
}

function ToolbarIconButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            className="size-7 text-muted-foreground hover:text-foreground"
            onClick={onClick}
            size="icon-sm"
            title={label}
            type="button"
            variant="ghost"
          >
            {children}
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function DiffViewModeToggleIcon({ mode }: { mode: EditorDiffViewMode }) {
  if (mode === "stacked") return <RowsIcon className="size-3.5" />

  return <ColumnsIcon className="size-3.5" />
}

function iconName(path: string) {
  const diff = parseDiffDocumentId(path)
  if (diff) return basename(diff.path)

  return basename(path)
}

function tabName(path: string) {
  if (parseDiffDocumentId(path)) return diffDocumentLabel(path)

  return basename(path)
}

function tabTitle(path: string) {
  if (parseDiffDocumentId(path)) return diffDocumentTitle(path)

  return displayPath(path)
}

function tabDiffStatus(
  path: string,
  files: readonly FileStatus[],
  rootPath: string
) {
  const diff = parseDiffDocumentId(path)
  if (!diff) return null

  const file = files.find((file) => diffStatusMatchesFile(diff, file, rootPath))
  const live = file ? liveSymbolForDiff(diff, file) : null
  if (live) return live
  if (diff.kind !== "snapshot" || !diff.status) return null

  return gitStatusSymbol(diff.status, "historical")
}

function tabDiffSuffix(hash: string, status: string | undefined) {
  if (!hash) return ""
  if (!status) return `(${hash})`

  return `(${hash} ${status})`
}

function diffStatusMatchesFile(
  diff: NonNullable<ReturnType<typeof parseDiffDocumentId>>,
  file: FileStatus,
  rootPath: string
) {
  return pathSetsOverlap(diffStatusPaths(diff), statusPaths(file), rootPath)
}

const EMPTY_GIT_FILES: readonly FileStatus[] = []

function liveSymbolForDiff(
  diff: NonNullable<ReturnType<typeof parseDiffDocumentId>>,
  file: FileStatus
) {
  const preferred = diff.kind === "snapshot" ? diff.source : undefined
  const source = liveSymbolSource(file, preferred)
  if (!source) return null

  return gitStatusSymbol(statusForSymbolSource(file, source), source)
}

function liveSymbolSource(
  file: FileStatus,
  preferred: GitSymbolSource | undefined
): GitSymbolSource | null {
  if (preferred === "staged" && isStagedStatus(file.index)) return "staged"
  if (preferred === "worktree" && isWorktreeStatus(file.worktree))
    return "worktree"
  if (isStagedStatus(file.index)) return "staged"
  if (isWorktreeStatus(file.worktree)) return "worktree"

  return null
}

function statusForSymbolSource(file: FileStatus, source: GitSymbolSource) {
  if (source === "staged") return file.index
  if (source === "worktree") return file.worktree

  return file.status
}

function isStagedStatus(status: FileStatus["index"]) {
  return status !== "unmodified" && status !== "untracked"
}

function isWorktreeStatus(status: FileStatus["worktree"]) {
  return status !== "unmodified"
}

function diffStatusPaths(
  diff: NonNullable<ReturnType<typeof parseDiffDocumentId>>
) {
  if (diff.kind === "legacy") return [diff.path]

  return [diff.path, diff.query.oldPath].filter(isPresentPath)
}

function statusPaths(file: FileStatus) {
  return [file.path, file.oldPath].filter(isPresentPath)
}

function isPresentPath(path: string | undefined): path is string {
  return Boolean(path)
}

function pathSetsOverlap(
  left: readonly string[],
  right: readonly string[],
  rootPath: string
) {
  const normalizedRight = new Set(
    right.flatMap((path) => comparablePaths(path, rootPath))
  )

  return left.some((path) =>
    comparablePaths(path, rootPath).some((candidate) =>
      normalizedRight.has(candidate)
    )
  )
}

function comparablePaths(path: string, rootPath: string) {
  const normalized = normalizePath(path)
  const root = normalizePath(rootPath)
  const paths = [normalized, stripLeadingSlash(normalized)]
  const rootPrefix = `${root}/`

  if (root && normalized.startsWith(rootPrefix)) {
    paths.push(normalized.slice(rootPrefix.length))
  }

  return [...new Set(paths.filter(Boolean))]
}

function normalizePath(path: string) {
  return path.replace(/\/+/gu, "/").replace(/\/$/u, "")
}

function stripLeadingSlash(path: string) {
  return path.startsWith("/") ? path.slice(1) : path
}

function tabSizingClassName(tabSizing: EditorTabSizing) {
  if (tabSizing === "fixed") return "min-w-[50px] max-w-40 flex-[1_0_0]"
  if (tabSizing === "shrink") return "min-w-20 max-w-fit basis-0 grow"

  return "w-[120px] min-w-fit shrink-0"
}

function scrollSelectedTabIntoView(
  tabList: HTMLElement | null,
  selectedTab: HTMLElement | null
) {
  if (!tabList || !selectedTab) return

  const tabListRect = tabList.getBoundingClientRect()
  const selectedTabRect = selectedTab.getBoundingClientRect()

  if (selectedTabRect.left < tabListRect.left) {
    tabList.scrollLeft -= tabListRect.left - selectedTabRect.left
    return
  }

  if (selectedTabRect.right > tabListRect.right) {
    tabList.scrollLeft += selectedTabRect.right - tabListRect.right
  }
}

function fileIconStyle(icon: ResolvedFileIcon): CSSProperties {
  const mask = `url(${icon.src}) center / contain no-repeat`

  return {
    backgroundColor: colorForFileIcon(icon),
    mask,
    WebkitMask: mask,
  }
}
