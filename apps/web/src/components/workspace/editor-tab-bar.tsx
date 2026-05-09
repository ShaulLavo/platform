import { ColumnsIcon, RowsIcon, XIcon } from "@phosphor-icons/react"
import { useLayoutEffect, useRef, type CSSProperties } from "react"

import {
  nextEditorDiffViewMode,
  type EditorDiffViewMode,
} from "@/components/editor/diff-view-mode"
import { useEditorState } from "@/components/editor/editor-state"
import { useWorkspaceFocus } from "@/components/workspace/workspace-focus-state"
import {
  diffDocumentLabel,
  diffDocumentTitle,
  parseDiffDocumentId,
} from "@/features/git/diff-document"
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
  tabSizing = DEFAULT_EDITOR_TAB_SIZING,
}: {
  diffViewMode?: EditorDiffViewMode | null
  onDiffViewModeChange?: (mode: EditorDiffViewMode) => void
  tabSizing?: EditorTabSizing
}) {
  const selectedTabRef = useRef<HTMLDivElement>(null)
  const tabListRef = useRef<HTMLDivElement>(null)
  const dirtyFilePaths = useEditorState((state) => state.dirtyFilePaths)
  const openFilePaths = useEditorState((state) => state.openFilePaths)
  const selectedFilePath = useEditorState((state) => state.selectedFilePath)
  const closeTab = useEditorState((state) => state.closeTab)
  const selectFile = useEditorState((state) => state.selectFile)
  const requestEditorFocus = useWorkspaceFocus(
    (state) => state.requestEditorFocus
  )

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
      {diffViewMode && onDiffViewModeChange ? (
        <DiffViewModeToggle
          mode={diffViewMode}
          onModeChange={onDiffViewModeChange}
        />
      ) : null}
    </nav>
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
    <div className="flex h-full shrink-0 items-center border-l bg-background/40 px-1">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-label={label}
              className="size-7 text-muted-foreground hover:text-foreground"
              onClick={handleClick}
              size="icon-sm"
              title={label}
              type="button"
              variant="ghost"
            >
              <DiffViewModeToggleIcon mode={nextMode} />
            </Button>
          }
        />
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </div>
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
