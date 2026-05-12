import {
  ArrowDownIcon,
  ArrowUpIcon,
  ColumnsIcon,
  FileIcon,
  RowsIcon,
  XIcon,
} from "@phosphor-icons/react"
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
  type ReactNode,
} from "react"

import {
  CHROME_TAB_ACTIVE_MIN_WIDTH,
  CHROME_TAB_CLOSED_WIDTH,
  CHROME_TAB_HEIGHT,
  CHROME_TAB_INACTIVE_MIN_WIDTH,
  CHROME_TAB_STANDARD_WIDTH,
  CHROME_TAB_TRAILING_SLOT_WIDTH,
  chromeTabLayout,
} from "@/components/workspace/chrome-tab-layout"
import {
  nextEditorDiffViewMode,
  type EditorDiffViewMode,
} from "@/features/editor/utils/diff-view-mode"
import {
  conflictDiffDocumentLabel,
  conflictDiffDocumentTitle,
  parseConflictDiffDocumentId,
} from "@/features/editor/conflict-diff-document"
import { useEditorCommands } from "@/features/editor/state/editor-commands"
import { useEditorConflictState } from "@/features/editor/state/editor-conflict-state"
import { useEditorDocumentState } from "@/features/editor/state/editor-document-state"
import type { RequestCloseTab } from "@/features/editor/hooks/use-dirty-tab-close"
import { useEditorWorkspaceState } from "@/features/editor/state/editor-workspace-state"
import { useWorkspaceFocus } from "@/components/workspace/workspace-focus-state"
import {
  diffDocumentLabel,
  diffDocumentShortHash,
  diffDocumentTitle,
  parseDiffDocumentId,
} from "@/features/git/diff-document"
import {
  parseSearchBufferDocumentId,
  searchBufferDocumentLabel,
  searchBufferDocumentTitle,
} from "@/features/search/search-buffer-document"
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

export type EditorTabSizing = "chrome" | "fit" | "fixed" | "shrink"

const DEFAULT_EDITOR_TAB_SIZING: EditorTabSizing = "chrome"
const CHROME_TAB_GROW_DELAY_MS = 1200
const CHROME_TAB_TRANSITION =
  "flex-basis 160ms cubic-bezier(0.2, 0, 0, 1), margin-left 160ms cubic-bezier(0.2, 0, 0, 1), max-width 160ms cubic-bezier(0.2, 0, 0, 1), min-width 160ms cubic-bezier(0.2, 0, 0, 1), width 160ms cubic-bezier(0.2, 0, 0, 1)"
const CHROME_TAB_SLOT_TRANSITION =
  "max-width 160ms cubic-bezier(0.2, 0, 0, 1), min-width 160ms cubic-bezier(0.2, 0, 0, 1), width 160ms cubic-bezier(0.2, 0, 0, 1)"

type EditorTabModel = {
  active: boolean
  diffStatus: ReturnType<typeof tabDiffStatus>
  diffSuffix: string
  dirty: boolean
  icon: ResolvedFileIcon
  name: string
  path: string
  title: string
}

type ChromeVisualTabPhase = "opening" | "present"

type ChromeVisualTab = {
  phase: ChromeVisualTabPhase
  tab: EditorTabModel
}

type ChromeVisualTabsState = {
  sourceTabs: readonly EditorTabModel[]
  visualTabs: readonly ChromeVisualTab[]
}

export function EditorTabBar({
  diffViewMode = null,
  onDiffViewModeChange,
  onRequestCloseTab,
  onRevealNextChange,
  onRevealPreviousChange,
  rootPath,
  tabSizing = DEFAULT_EDITOR_TAB_SIZING,
}: {
  diffViewMode?: EditorDiffViewMode | null
  onDiffViewModeChange?: (mode: EditorDiffViewMode) => void
  onRequestCloseTab: RequestCloseTab
  onRevealNextChange?: () => void
  onRevealPreviousChange?: () => void
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
  const conflicts = useEditorConflictState((state) => state.conflicts)
  const { selectFile } = useEditorCommands()
  const requestEditorFocus = useWorkspaceFocus(
    (state) => state.requestEditorFocus
  )
  const gitStatus = useStatus(rootPath)
  const gitFiles = gitStatus.data?.files ?? EMPTY_GIT_FILES
  const editorTabs = useMemo(
    () =>
      openFilePaths.map((path) =>
        editorTabModel({
          conflicts,
          dirty: dirtyFilePaths.has(path),
          gitFiles,
          path,
          rootPath,
          selectedFilePath,
        })
      ),
    [
      conflicts,
      dirtyFilePaths,
      gitFiles,
      openFilePaths,
      rootPath,
      selectedFilePath,
    ]
  )
  const visualTabs = useChromeVisualTabs(editorTabs, tabSizing === "chrome")

  useLayoutEffect(() => {
    if (tabSizing === "chrome") return
    if (!selectedFilePath) return

    scrollSelectedTabIntoView(tabListRef.current, selectedTabRef.current)
  }, [selectedFilePath, tabSizing])

  if (openFilePaths.length === 0 && visualTabs.length === 0) return null

  function handleSelectTab(path: string) {
    selectFile(path)
    requestEditorFocus()
  }

  return (
    <nav
      aria-label="Open files"
      className={cn(
        "flex min-w-0 shrink-0 border-b bg-muted/30",
        tabSizing === "chrome" ? "h-[41px]" : "h-10"
      )}
    >
      <div
        className={cn(
          "app-scrollbar-thin min-w-0 flex-1 overflow-x-auto",
          tabSizing === "chrome" ? "relative overflow-y-hidden" : "flex"
        )}
        ref={tabListRef}
        role="tablist"
      >
        {tabSizing === "chrome" ? (
          <ChromeEditorTabList
            selectedTabRef={selectedTabRef}
            tabListRef={tabListRef}
            tabs={visualTabs}
            onClose={onRequestCloseTab}
            onSelect={handleSelectTab}
          />
        ) : (
          <LegacyEditorTabList
            selectedTabRef={selectedTabRef}
            tabSizing={tabSizing}
            tabs={editorTabs}
            onClose={onRequestCloseTab}
            onSelect={handleSelectTab}
          />
        )}
      </div>
      {diffViewMode && onDiffViewModeChange && selectedDiff ? (
        <DiffTabActions
          diffPath={selectedDiff.path}
          mode={diffViewMode}
          onModeChange={onDiffViewModeChange}
          onOpenFile={handleSelectTab}
          onRevealNextChange={onRevealNextChange}
          onRevealPreviousChange={onRevealPreviousChange}
        />
      ) : null}
    </nav>
  )
}

function LegacyEditorTabList({
  selectedTabRef,
  tabSizing,
  tabs,
  onClose,
  onSelect,
}: {
  selectedTabRef: RefObject<HTMLDivElement | null>
  tabSizing: Exclude<EditorTabSizing, "chrome">
  tabs: readonly EditorTabModel[]
  onClose: RequestCloseTab
  onSelect: (path: string) => void
}) {
  return (
    <div className="flex min-w-full flex-1 items-end">
      {tabs.map((tab) => {
        const showCloseIcon = tab.active && !tab.dirty

        return (
          <div
            className={cn(
              "group flex h-10 items-center border-r border-border bg-background/40 text-xs",
              tabSizingClassName(tabSizing),
              tab.active &&
                "border-t-2 border-t-foreground bg-background text-foreground"
            )}
            key={tab.path}
            ref={tab.active ? selectedTabRef : undefined}
          >
            <button
              aria-selected={tab.active}
              className={cn(
                "flex h-full min-w-0 flex-1 items-center gap-2 px-3 text-left text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50",
                tab.active && "text-foreground"
              )}
              onClick={() => onSelect(tab.path)}
              role="tab"
              title={tab.title}
              type="button"
            >
              <span
                aria-hidden="true"
                className="size-3.5 shrink-0 object-contain"
                style={fileIconStyle(tab.icon)}
              />
              <span className="truncate">{tab.name}</span>
              {tab.diffSuffix ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "shrink-0 text-xs leading-none font-semibold tabular-nums",
                    tab.diffStatus?.className ?? "text-muted-foreground"
                  )}
                  title={tab.diffStatus?.title}
                >
                  {tab.diffSuffix}
                </span>
              ) : null}
            </button>
            <button
              aria-label={`Close ${tab.name}`}
              className={cn(
                "group/close relative mr-1 flex size-6 shrink-0 items-center justify-center text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50",
                showCloseIcon || tab.dirty
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              )}
              onClick={() => onClose(tab.path)}
              title={`Close ${tab.name}`}
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
              {tab.dirty ? (
                <span
                  aria-hidden="true"
                  className="absolute size-2 rounded-full bg-amber-500 transition-opacity group-hover:opacity-0 group-focus-visible/close:opacity-0"
                />
              ) : null}
            </button>
          </div>
        )
      })}
    </div>
  )
}

function ChromeEditorTabList({
  selectedTabRef,
  tabListRef,
  tabs,
  onClose,
  onSelect,
}: {
  selectedTabRef: RefObject<HTMLDivElement | null>
  tabListRef: RefObject<HTMLDivElement | null>
  tabs: readonly ChromeVisualTab[]
  onClose: RequestCloseTab
  onSelect: (path: string) => void
}) {
  const activePath = activeChromeTabPath(tabs)
  const measuredAvailableWidth = useElementWidth(tabListRef)
  const [closeModeSpacerWidth, setCloseModeSpacerWidth] = useState(0)
  const [hoveredChromeTabPath, setHoveredChromeTabPath] = useState<
    string | null
  >(null)
  const [focusedChromeTabPath, setFocusedChromeTabPath] = useState<
    string | null
  >(null)
  const trailingSlotWidths = useMemo(
    () =>
      chromeTrailingSlotWidths(
        tabs,
        hoveredChromeTabPath,
        focusedChromeTabPath
      ),
    [focusedChromeTabPath, hoveredChromeTabPath, tabs]
  )
  const availableWidth =
    measuredAvailableWidth === null
      ? null
      : Math.max(0, measuredAvailableWidth - closeModeSpacerWidth)
  const layout =
    availableWidth === null
      ? null
      : chromeTabLayout({
          activeIndex: tabs.findIndex((visualTab) => visualTab.tab.active),
          availableWidth,
          tabCount: tabs.length,
          trailingSlotWidths,
        })
  const overlap = layout?.overlap ?? 0
  const spacerStyle = chromeCloseSpacerStyle(closeModeSpacerWidth)

  useLayoutEffect(() => {
    scrollSelectedTabIntoView(tabListRef.current, selectedTabRef.current)
  }, [activePath, selectedTabRef, tabListRef, tabs.length])

  useEffect(() => {
    if (closeModeSpacerWidth <= 0) return

    const timeout = window.setTimeout(() => {
      setCloseModeSpacerWidth(0)
    }, CHROME_TAB_GROW_DELAY_MS)

    return () => window.clearTimeout(timeout)
  }, [closeModeSpacerWidth])

  function handleClose(path: string, width: number | null) {
    const closed = onClose(path)
    if (!closed) return

    const nextSpacerWidth = nextCloseModeSpacerWidth(
      closeModeSpacerWidth,
      layout,
      width
    )
    setCloseModeSpacerWidth(nextSpacerWidth)
  }

  function handleChromeTabFocusChange(path: string, focused: boolean) {
    if (focused) {
      setFocusedChromeTabPath(path)
      return
    }

    setFocusedChromeTabPath((current) => (current === path ? null : current))
  }

  function handleChromeTabHoverChange(path: string, hovered: boolean) {
    if (hovered) {
      setHoveredChromeTabPath(path)
      return
    }

    setHoveredChromeTabPath((current) => (current === path ? null : current))
  }

  return (
    <div className="flex min-w-full items-end overflow-visible">
      {tabs.map((visualTab, index) => {
        const hoveredOrFocused = chromeVisualTabHoveredOrFocused(
          visualTab,
          hoveredChromeTabPath,
          focusedChromeTabPath
        )

        return (
          <ChromeEditorTab
            hoveredOrFocused={hoveredOrFocused}
            index={index}
            layoutWidth={layout?.tabs[index]?.width ?? null}
            key={visualTab.tab.path}
            overlap={overlap}
            tabRef={visualTab.tab.active ? selectedTabRef : undefined}
            trailingSlotWidth={trailingSlotWidths[index] ?? 0}
            visualTab={visualTab}
            onClose={handleClose}
            onFocusChange={handleChromeTabFocusChange}
            onHoverChange={handleChromeTabHoverChange}
            onSelect={onSelect}
          />
        )
      })}
      <div
        aria-hidden="true"
        className="pointer-events-none"
        style={spacerStyle}
      />
    </div>
  )
}

function ChromeEditorTab({
  hoveredOrFocused,
  index,
  layoutWidth,
  overlap,
  tabRef,
  trailingSlotWidth,
  visualTab,
  onClose,
  onFocusChange,
  onHoverChange,
  onSelect,
}: {
  hoveredOrFocused: boolean
  index: number
  layoutWidth: number | null
  overlap: number
  tabRef?: RefObject<HTMLDivElement | null>
  trailingSlotWidth: number
  visualTab: ChromeVisualTab
  onClose: (path: string, width: number | null) => void
  onFocusChange: (path: string, focused: boolean) => void
  onHoverChange: (path: string, hovered: boolean) => void
  onSelect: (path: string) => void
}) {
  const tab = visualTab.tab
  const tabStyle = chromeTabStyle(
    visualTab,
    index,
    overlap,
    layoutWidth,
    trailingSlotWidth
  )

  return (
    <div
      className={cn(
        "group group/chrome-tab relative flex items-center overflow-hidden border-x border-border/80 bg-muted/55 text-xs text-muted-foreground hover:z-20 hover:bg-background/70",
        "z-[var(--chrome-tab-z)]",
        tab.active &&
          "z-30 border-border bg-background text-foreground shadow-none"
      )}
      data-chrome-tab-root=""
      onBlurCapture={(event) => {
        if (elementContainsTarget(event.currentTarget, event.relatedTarget))
          return

        onFocusChange(tab.path, false)
      }}
      onFocusCapture={() => onFocusChange(tab.path, true)}
      onPointerEnter={() => onHoverChange(tab.path, true)}
      onPointerLeave={() => onHoverChange(tab.path, false)}
      ref={tabRef}
      style={tabStyle}
    >
      <button
        aria-selected={tab.active}
        className="flex h-full min-w-0 flex-1 items-center gap-1.5 py-0 pr-1.5 pl-3 text-left transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
        onClick={() => onSelect(tab.path)}
        role="tab"
        title={tab.title}
        type="button"
      >
        <span
          aria-hidden="true"
          className="size-3.5 shrink-0 object-contain"
          style={fileIconStyle(tab.icon)}
        />
        <ChromeTabTitle tab={tab} />
      </button>
      <ChromeTabTrailingSlot
        hoveredOrFocused={hoveredOrFocused}
        tab={tab}
        width={trailingSlotWidth}
        onClose={onClose}
      />
    </div>
  )
}

function ChromeTabTrailingSlot({
  hoveredOrFocused,
  tab,
  width,
  onClose,
}: {
  hoveredOrFocused: boolean
  tab: EditorTabModel
  width: number
  onClose: (path: string, width: number | null) => void
}) {
  const showCloseIcon = chromeTabShowsCloseIcon(tab, hoveredOrFocused)
  const showDirtyIndicator = chromeTabShowsDirtyIndicator(tab, hoveredOrFocused)

  return (
    <div
      className="relative flex h-full shrink-0 items-center justify-center overflow-hidden"
      style={chromeTabTrailingSlotStyle(width)}
    >
      <button
        aria-label={`Close ${tab.name}`}
        className={cn(
          "group/close flex size-6 shrink-0 items-center justify-center rounded-[5px] text-muted-foreground transition-[background-color,color,opacity] outline-none hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50",
          showCloseIcon ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={(event) => {
          event.stopPropagation()
          onClose(tab.path, chromeTabRootWidth(event.currentTarget))
        }}
        title={`Close ${tab.name}`}
        type="button"
      >
        <XIcon className="size-3 opacity-70" />
      </button>
      {tab.dirty ? (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute size-2 rounded-full bg-amber-500 transition-opacity",
            showDirtyIndicator ? "opacity-100" : "opacity-0"
          )}
        />
      ) : null}
    </div>
  )
}

function ChromeTabTitle({ tab }: { tab: EditorTabModel }) {
  return (
    <span className="flex min-w-0 items-baseline gap-1 overflow-hidden whitespace-nowrap">
      <span className="min-w-0 shrink truncate">{tab.name}</span>
      {tab.diffSuffix ? (
        <span
          aria-hidden="true"
          className={cn(
            "shrink-0 text-xs leading-none font-semibold tabular-nums",
            tab.diffStatus?.className ?? "text-muted-foreground"
          )}
          title={tab.diffStatus?.title}
        >
          {tab.diffSuffix}
        </span>
      ) : null}
    </span>
  )
}

function useElementWidth<TElement extends HTMLElement>(
  ref: RefObject<TElement | null>
) {
  const [width, setWidth] = useState<number | null>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    function updateWidth() {
      setWidth(element?.clientWidth ?? null)
    }

    updateWidth()

    if (!("ResizeObserver" in window)) return

    const observer = new ResizeObserver(updateWidth)
    observer.observe(element)

    return () => observer.disconnect()
  }, [ref])

  return width
}

function useChromeVisualTabs(
  tabs: readonly EditorTabModel[],
  enabled: boolean
) {
  const [state, setState] = useState<ChromeVisualTabsState>(() => ({
    sourceTabs: tabs,
    visualTabs: tabs.map(presentChromeVisualTab),
  }))
  let visualTabs = state.visualTabs
  if (enabled && state.sourceTabs !== tabs) {
    visualTabs = syncChromeVisualTabs(state.visualTabs, tabs)
    setState({ sourceTabs: tabs, visualTabs })
  }

  const openingKey = chromeVisualTabPhaseKey(visualTabs, "opening")

  useLayoutEffect(() => {
    if (!enabled) return
    if (!openingKey) return

    const frame = requestAnimationFrame(() => {
      setState((current) => ({
        ...current,
        visualTabs: openingChromeVisualTabs(current.visualTabs),
      }))
    })

    return () => cancelAnimationFrame(frame)
  }, [enabled, openingKey])

  if (!enabled) return []

  return visualTabs
}

function syncChromeVisualTabs(
  current: readonly ChromeVisualTab[],
  tabs: readonly EditorTabModel[]
) {
  if (current.length === 0) return tabs.map(presentChromeVisualTab)

  const openByPath = new Map(tabs.map((tab) => [tab.path, tab]))
  const emittedPaths = new Set<string>()
  const next: ChromeVisualTab[] = []

  for (const visualTab of current) {
    const openTab = openByPath.get(visualTab.tab.path)
    if (!openTab) continue

    next.push(nextChromeVisualTab(visualTab, openTab))
    emittedPaths.add(openTab.path)
  }

  for (const tab of tabs) {
    if (emittedPaths.has(tab.path)) continue

    insertOpeningChromeVisualTab(next, tab, tabs)
  }

  if (sameChromeVisualTabs(current, next)) return current

  return next
}

function nextChromeVisualTab(
  visualTab: ChromeVisualTab,
  openTab: EditorTabModel
): ChromeVisualTab {
  if (visualTab.phase === "opening") return { phase: "opening", tab: openTab }

  return { phase: "present", tab: openTab }
}

function insertOpeningChromeVisualTab(
  visualTabs: ChromeVisualTab[],
  tab: EditorTabModel,
  tabs: readonly EditorTabModel[]
) {
  const visualTab = { phase: "opening" as const, tab }
  const previousIndex = previousVisualTabIndex(visualTabs, tab, tabs)
  if (previousIndex >= 0) {
    visualTabs.splice(previousIndex + 1, 0, visualTab)
    return
  }

  const nextIndex = nextVisualTabIndex(visualTabs, tab, tabs)
  if (nextIndex >= 0) {
    visualTabs.splice(nextIndex, 0, visualTab)
    return
  }

  visualTabs.push(visualTab)
}

function previousVisualTabIndex(
  visualTabs: readonly ChromeVisualTab[],
  tab: EditorTabModel,
  tabs: readonly EditorTabModel[]
) {
  const tabIndex = tabs.findIndex((candidate) => candidate.path === tab.path)
  const previousPaths = new Set(
    tabs.slice(0, tabIndex).map((item) => item.path)
  )

  return findLastIndex(visualTabs, (visualTab) =>
    previousPaths.has(visualTab.tab.path)
  )
}

function nextVisualTabIndex(
  visualTabs: readonly ChromeVisualTab[],
  tab: EditorTabModel,
  tabs: readonly EditorTabModel[]
) {
  const tabIndex = tabs.findIndex((candidate) => candidate.path === tab.path)
  const nextPaths = new Set(tabs.slice(tabIndex + 1).map((item) => item.path))

  return visualTabs.findIndex((visualTab) => nextPaths.has(visualTab.tab.path))
}

function findLastIndex<T>(
  values: readonly T[],
  predicate: (value: T) => boolean
) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (predicate(values[index] as T)) return index
  }

  return -1
}

function presentChromeVisualTab(tab: EditorTabModel): ChromeVisualTab {
  return { phase: "present", tab }
}

function openingChromeVisualTabs(current: readonly ChromeVisualTab[]) {
  return current.map((visualTab) => {
    if (visualTab.phase !== "opening") return visualTab

    return { ...visualTab, phase: "present" as const }
  })
}

function chromeVisualTabPhaseKey(
  visualTabs: readonly ChromeVisualTab[],
  phase: ChromeVisualTabPhase
) {
  return visualTabs
    .filter((visualTab) => visualTab.phase === phase)
    .map((visualTab) => visualTab.tab.path)
    .join("\0")
}

function activeChromeTabPath(visualTabs: readonly ChromeVisualTab[]) {
  return visualTabs.find((visualTab) => visualTab.tab.active)?.tab.path ?? null
}

function chromeTrailingSlotWidths(
  visualTabs: readonly ChromeVisualTab[],
  hoveredPath: string | null,
  focusedPath: string | null
) {
  return visualTabs.map((visualTab) => {
    const hoveredOrFocused = chromeVisualTabHoveredOrFocused(
      visualTab,
      hoveredPath,
      focusedPath
    )
    if (!chromeTabHasTrailingSlot(visualTab.tab, hoveredOrFocused)) return 0

    return CHROME_TAB_TRAILING_SLOT_WIDTH
  })
}

function chromeVisualTabHoveredOrFocused(
  visualTab: ChromeVisualTab,
  hoveredPath: string | null,
  focusedPath: string | null
) {
  const path = visualTab.tab.path

  return path === hoveredPath || path === focusedPath
}

function chromeTabHasTrailingSlot(
  tab: EditorTabModel,
  hoveredOrFocused: boolean
) {
  return tab.active || tab.dirty || hoveredOrFocused
}

function chromeTabShowsCloseIcon(
  tab: EditorTabModel,
  hoveredOrFocused: boolean
) {
  if (tab.dirty) return hoveredOrFocused

  return tab.active || hoveredOrFocused
}

function chromeTabShowsDirtyIndicator(
  tab: EditorTabModel,
  hoveredOrFocused: boolean
) {
  return tab.dirty && !hoveredOrFocused
}

function chromeCloseSpacerStyle(width: number) {
  return {
    flex: `0 0 ${width}px`,
    maxWidth: width,
    minWidth: width,
    width,
  } as CSSProperties
}

function chromeTabTrailingSlotStyle(width: number) {
  return {
    maxWidth: width,
    minWidth: width,
    transition: CHROME_TAB_SLOT_TRANSITION,
    width,
  } as CSSProperties
}

function chromeTabRootWidth(element: HTMLElement) {
  return (
    element.closest("[data-chrome-tab-root]")?.getBoundingClientRect().width ??
    null
  )
}

function elementContainsTarget(element: HTMLElement, target: EventTarget | null) {
  if (!(target instanceof Node)) return false

  return element.contains(target)
}

function nextCloseModeSpacerWidth(
  currentSpacerWidth: number,
  layout: ReturnType<typeof chromeTabLayout> | null,
  closedTabWidth: number | null
) {
  if (closedTabWidth === null) return currentSpacerWidth

  const overlap = layout?.overlap ?? 0
  const closedTabAdvance = Math.max(0, closedTabWidth - overlap)

  return currentSpacerWidth + closedTabAdvance
}

function chromeTabStyle(
  visualTab: ChromeVisualTab,
  index: number,
  overlap: number,
  layoutWidth: number | null,
  trailingSlotWidth: number
) {
  const tab = visualTab.tab
  const fixedWidth = closingOrOpeningTabWidth(visualTab)
  const targetWidth = fixedWidth ?? layoutWidth
  const minWidth = tab.active
    ? CHROME_TAB_ACTIVE_MIN_WIDTH + trailingSlotWidth
    : CHROME_TAB_INACTIVE_MIN_WIDTH + trailingSlotWidth

  return {
    "--chrome-tab-z": tab.active ? 30 : 1,
    flex: targetWidth === null ? "1 1 0px" : `0 0 ${targetWidth}px`,
    height: CHROME_TAB_HEIGHT,
    marginLeft: index === 0 ? 0 : -overlap,
    maxWidth: targetWidth ?? CHROME_TAB_STANDARD_WIDTH + trailingSlotWidth,
    minWidth: targetWidth ?? minWidth,
    transition: CHROME_TAB_TRANSITION,
    width: targetWidth ?? "auto",
  } as CSSProperties
}

function closingOrOpeningTabWidth(visualTab: ChromeVisualTab) {
  if (visualTab.phase === "opening") return CHROME_TAB_CLOSED_WIDTH

  return null
}

function sameChromeVisualTabs(
  left: readonly ChromeVisualTab[],
  right: readonly ChromeVisualTab[]
) {
  if (left.length !== right.length) return false

  return left.every((visualTab, index) =>
    sameChromeVisualTab(visualTab, right[index])
  )
}

function sameChromeVisualTab(
  left: ChromeVisualTab,
  right: ChromeVisualTab | undefined
) {
  if (!right) return false
  if (left.phase !== right.phase) return false

  return sameEditorTabModel(left.tab, right.tab)
}

function sameEditorTabModel(left: EditorTabModel, right: EditorTabModel) {
  if (left.active !== right.active) return false
  if (left.dirty !== right.dirty) return false
  if (left.diffSuffix !== right.diffSuffix) return false
  if (left.icon.name !== right.icon.name) return false
  if (left.name !== right.name) return false
  if (left.path !== right.path) return false
  if (left.title !== right.title) return false

  return sameDiffStatus(left.diffStatus, right.diffStatus)
}

function sameDiffStatus(
  left: ReturnType<typeof tabDiffStatus>,
  right: ReturnType<typeof tabDiffStatus>
) {
  if (left?.className !== right?.className) return false
  if (left?.label !== right?.label) return false

  return left?.title === right?.title
}

function editorTabModel({
  conflicts,
  dirty,
  gitFiles,
  path,
  rootPath,
  selectedFilePath,
}: {
  conflicts: Readonly<Record<string, { remotePath: string }>>
  dirty: boolean
  gitFiles: readonly FileStatus[]
  path: string
  rootPath: string
  selectedFilePath: string | null
}): EditorTabModel {
  const diffStatus = tabDiffStatus(path, gitFiles, rootPath)
  const diffHash = diffDocumentShortHash(path)

  return {
    active: path === selectedFilePath,
    diffStatus,
    diffSuffix: tabDiffSuffix(diffHash, diffStatus?.label),
    dirty,
    icon: iconForEntry({
      name: iconName(path, conflicts),
      type: "file",
    }),
    name: tabName(path, conflicts),
    path,
    title: tabTitle(path, conflicts),
  }
}

function DiffTabActions({
  diffPath,
  mode,
  onModeChange,
  onOpenFile,
  onRevealNextChange,
  onRevealPreviousChange,
}: {
  diffPath: string
  mode: EditorDiffViewMode
  onModeChange: (mode: EditorDiffViewMode) => void
  onOpenFile: (path: string) => void
  onRevealNextChange?: () => void
  onRevealPreviousChange?: () => void
}) {
  return (
    <div className="flex h-full shrink-0 items-center gap-0.5 border-l bg-background/40 px-1">
      <RevealChangeButton
        direction="previous"
        onRevealChange={onRevealPreviousChange}
      />
      <RevealChangeButton
        direction="next"
        onRevealChange={onRevealNextChange}
      />
      <OpenOriginalFileButton path={diffPath} onOpenFile={onOpenFile} />
      <DiffViewModeToggle mode={mode} onModeChange={onModeChange} />
    </div>
  )
}

function RevealChangeButton({
  direction,
  onRevealChange,
}: {
  direction: "previous" | "next"
  onRevealChange?: () => void
}) {
  const label = `${capitalize(direction)} change`
  const Icon = direction === "previous" ? ArrowUpIcon : ArrowDownIcon

  return (
    <ToolbarIconButton
      disabled={!onRevealChange}
      label={label}
      onClick={() => onRevealChange?.()}
    >
      <Icon className="size-3.5" />
    </ToolbarIconButton>
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
  disabled = false,
  label,
  onClick,
}: {
  children: ReactNode
  disabled?: boolean
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
            disabled={disabled}
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

function capitalize(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`
}

function DiffViewModeToggleIcon({ mode }: { mode: EditorDiffViewMode }) {
  if (mode === "stacked") return <RowsIcon className="size-3.5" />

  return <ColumnsIcon className="size-3.5" />
}

function iconName(
  path: string,
  conflicts: Readonly<Record<string, { remotePath: string }>>
) {
  const diff = parseDiffDocumentId(path)
  const searchBuffer = parseSearchBufferDocumentId(path)
  if (searchBuffer) return "search.txt"
  if (diff) return basename(diff.path)
  const conflict = conflictForDocument(path, conflicts)
  if (conflict) return basename(conflict.remotePath)
  if (parseConflictDiffDocumentId(path)) return "conflict.txt"

  return basename(path)
}

function tabName(
  path: string,
  conflicts: Readonly<Record<string, { remotePath: string }>>
) {
  if (parseDiffDocumentId(path)) return diffDocumentLabel(path)
  if (parseSearchBufferDocumentId(path)) return searchBufferDocumentLabel()
  const conflict = conflictForDocument(path, conflicts)
  if (conflict) return conflictDiffDocumentLabel(conflict.remotePath)
  if (parseConflictDiffDocumentId(path)) return "Conflict"

  return basename(path)
}

function tabTitle(
  path: string,
  conflicts: Readonly<Record<string, { remotePath: string }>>
) {
  if (parseDiffDocumentId(path)) return diffDocumentTitle(path)
  const searchBuffer = parseSearchBufferDocumentId(path)
  if (searchBuffer) return searchBufferDocumentTitle(searchBuffer.rootPath)
  const conflict = conflictForDocument(path, conflicts)
  if (conflict) return conflictDiffDocumentTitle(conflict.remotePath)
  if (parseConflictDiffDocumentId(path)) return "Filesystem conflict editor"

  return displayPath(path)
}

function tabDiffStatus(
  path: string,
  files: readonly FileStatus[],
  rootPath: string
) {
  if (parseConflictDiffDocumentId(path)) return null
  if (parseSearchBufferDocumentId(path)) return null

  const diff = parseDiffDocumentId(path)
  if (!diff) return null

  const file = files.find((file) => diffStatusMatchesFile(diff, file, rootPath))
  const live = file ? liveSymbolForDiff(diff, file) : null
  if (live) return live
  if (diff.kind !== "snapshot" || !diff.status) return null

  return gitStatusSymbol(diff.status, "historical")
}

function conflictForDocument(
  path: string | null | undefined,
  conflicts: Readonly<Record<string, { remotePath: string }>>
) {
  const conflictDiff = parseConflictDiffDocumentId(path)
  if (!conflictDiff) return null

  return conflicts[conflictDiff.conflictId] ?? null
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
