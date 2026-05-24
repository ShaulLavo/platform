import {
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  ColumnsIcon,
  CopyIcon,
  FileIcon,
  FilesIcon,
  FloppyDiskIcon,
  RowsIcon,
  XIcon,
} from '@phosphor-icons/react'
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
  type ReactNode,
} from 'react'

import {
  CHROME_TAB_ACTIVE_MIN_WIDTH,
  CHROME_TAB_CLOSED_WIDTH,
  CHROME_TAB_HEIGHT,
  CHROME_TAB_INACTIVE_MIN_WIDTH,
  CHROME_TAB_STANDARD_WIDTH,
  CHROME_TAB_TRAILING_SLOT_WIDTH,
  chromeTabLayout,
} from '@/components/workspace/chrome-tab-layout'
import {
  editorTabCloseTargetIds,
  type EditorTabCloseTargetKind,
} from '@/components/workspace/editor-tab-close-targets'
import {
  useChromeVisualTabs,
  type ChromeVisualTab,
} from '@/components/workspace/use-chrome-visual-tabs'
import {
  editorTabInsertionEdge,
  useEditorTabDrag,
  type EditorTabDragController,
  type EditorTabInsertionEdge,
} from '@/components/workspace/use-editor-tab-drag'
import {
  nextEditorDiffViewMode,
  type EditorDiffViewMode,
} from '@/features/editor/utils/diff-view-mode'
import {
  conflictDiffDocumentLabel,
  conflictDiffDocumentTitle,
  parseConflictDiffDocumentId,
} from '@/features/editor/conflict-diff-document'
import { useEditorCommands } from '@/features/editor/state/editor-commands'
import {
  activeTabForPane,
  findEditorPane,
  type EditorPaneSplitDirection,
  type EditorPaneTab,
} from '@/features/editor/state/editor-pane-state'
import { useEditorConflictState } from '@/features/editor/state/editor-conflict-state'
import { useEditorDocumentState } from '@/features/editor/state/editor-document-state'
import type { RequestCloseTab, RequestCloseTabs } from '@/features/editor/hooks/use-dirty-tab-close'
import { useEditorWorkspaceState } from '@/features/editor/state/editor-workspace-state'
import { useWorkspaceFocus } from '@/components/workspace/workspace-focus-state'
import {
  diffDocumentLabel,
  diffDocumentShortHash,
  diffDocumentTitle,
  parseDiffDocumentId,
} from '@/features/git/diff-document'
import {
  parseSearchBufferDocumentId,
  searchBufferDocumentLabel,
  searchBufferDocumentTitle,
} from '@/features/search/search-buffer-document'
import { useStatus } from '@/features/git/hooks'
import { gitStatusSymbol, type GitSymbolSource } from '@/features/git/status-symbols'
import type { FileStatus } from '@/features/git/types'
import { reportClientError } from '@/lib/client-error-reporting'
import { colorForFileIcon, iconForEntry, type ResolvedFileIcon } from '@/lib/file-icons'
import { basename, displayPath } from '@/lib/path-formatters'
import { Button } from '@workspace/ui/components/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@workspace/ui/components/tooltip'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@workspace/ui/components/context-menu'
import { cn } from '@workspace/ui/lib/utils'
import { toast } from 'sonner'

export type EditorTabSizing = 'chrome' | 'fit' | 'fixed' | 'shrink'

const DEFAULT_EDITOR_TAB_SIZING: EditorTabSizing = 'chrome'
const CHROME_TAB_GROW_DELAY_MS = 1200
const CHROME_TAB_TRANSITION =
  'flex-basis 160ms cubic-bezier(0.2, 0, 0, 1), margin-left 160ms cubic-bezier(0.2, 0, 0, 1), max-width 160ms cubic-bezier(0.2, 0, 0, 1), min-width 160ms cubic-bezier(0.2, 0, 0, 1), width 160ms cubic-bezier(0.2, 0, 0, 1)'
const CHROME_TAB_SLOT_TRANSITION =
  'max-width 160ms cubic-bezier(0.2, 0, 0, 1), min-width 160ms cubic-bezier(0.2, 0, 0, 1), width 160ms cubic-bezier(0.2, 0, 0, 1)'

type EditorTabModel = {
  active: boolean
  copyPath: string
  copyRelativePath: string
  diffStatus: ReturnType<typeof tabDiffStatus>
  diffSuffix: string
  dirty: boolean
  icon: ResolvedFileIcon
  id: string
  name: string
  path: string
  title: string
}

type EditorChromeVisualTab = ChromeVisualTab<EditorTabModel>

export function EditorTabBar({
  diffViewMode = null,
  onDiffViewModeChange,
  onRequestCloseTab,
  onRequestCloseTabs,
  onRevealNextChange,
  onRevealPreviousChange,
  paneId,
  rootPath,
  tabSizing = DEFAULT_EDITOR_TAB_SIZING,
}: {
  diffViewMode?: EditorDiffViewMode | null
  onDiffViewModeChange?: (mode: EditorDiffViewMode) => void
  onRequestCloseTab: RequestCloseTab
  onRequestCloseTabs: RequestCloseTabs
  onRevealNextChange?: () => void
  onRevealPreviousChange?: () => void
  paneId: string
  rootPath: string
  tabSizing?: EditorTabSizing
}) {
  const selectedTabRef = useRef<HTMLDivElement>(null)
  const tabListRef = useRef<HTMLDivElement>(null)
  const dirtyFilePaths = useEditorDocumentState((state) => state.dirtyFilePaths)
  const editorPaneLayout = useEditorWorkspaceState((state) => state.editorPaneLayout)
  const pane = findEditorPane(editorPaneLayout.root, paneId)
  const selectedTab = pane ? activeTabForPane(pane) : null
  const selectedFilePath = selectedTab?.path ?? null
  const selectedDiff = parseDiffDocumentId(selectedFilePath)
  const conflicts = useEditorConflictState((state) => state.conflicts)
  const { moveTabToPane, reorderTab, selectFile, selectTab, splitTab } = useEditorCommands()
  const requestEditorFocus = useWorkspaceFocus((state) => state.requestEditorFocus)
  const gitStatus = useStatus(rootPath)
  const gitFiles = gitStatus.data?.files ?? EMPTY_GIT_FILES
  const editorTabs = useMemo(
    () =>
      (pane?.tabs ?? []).map((tab) =>
        editorTabModel({
          conflicts,
          dirty: dirtyFilePaths.has(tab.path),
          gitFiles,
          tab,
          rootPath,
          selectedTabId: selectedTab?.id ?? null,
        }),
      ),
    [conflicts, dirtyFilePaths, gitFiles, pane?.tabs, rootPath, selectedTab?.id],
  )
  const visualTabs = useChromeVisualTabs(editorTabs, tabSizing === 'chrome', sameEditorTabModel)
  const tabDrag = useEditorTabDrag({
    paneId,
    tabs: editorTabs,
    onMoveToPane: (tabId, targetIndex) => moveTabToPane(tabId, paneId, targetIndex),
    tabListRef,
    onReorder: (tabId, targetIndex) => reorderTab(paneId, tabId, targetIndex),
  })

  useLayoutEffect(() => {
    if (tabSizing === 'chrome') return
    if (!selectedFilePath) return

    scrollSelectedTabIntoView(tabListRef.current, selectedTabRef.current)
  }, [selectedFilePath, tabSizing])

  if (!pane) return null
  if (pane.tabs.length === 0 && visualTabs.length === 0) return null

  function handleSelectTab(tab: EditorTabModel) {
    selectTab(paneId, tab.id)
    requestEditorFocus()
  }

  function handleOpenFile(path: string) {
    selectFile(path)
    requestEditorFocus()
  }

  return (
    <nav
      aria-label='Open files'
      className={cn(
        'flex min-w-0 shrink-0 border-b bg-muted/30',
        tabSizing === 'chrome' ? 'h-[41px]' : 'h-10',
      )}
    >
      <div
        className={cn(
          'app-scrollbar-thin min-w-0 flex-1 overflow-x-auto',
          tabSizing === 'chrome' ? 'relative overflow-y-hidden' : 'flex',
        )}
        ref={tabListRef}
        role='tablist'
        onDragLeave={tabDrag.onDragLeave}
        onDragOver={tabDrag.onDragOver}
        onDrop={tabDrag.onDrop}
      >
        {tabSizing === 'chrome' ? (
          <ChromeEditorTabList
            selectedTabRef={selectedTabRef}
            tabListRef={tabListRef}
            drag={tabDrag}
            tabs={visualTabs}
            onClose={onRequestCloseTab}
            onCloseTabs={onRequestCloseTabs}
            onSplit={splitTab}
            onSelect={handleSelectTab}
          />
        ) : (
          <LegacyEditorTabList
            selectedTabRef={selectedTabRef}
            drag={tabDrag}
            tabSizing={tabSizing}
            tabs={editorTabs}
            onClose={onRequestCloseTab}
            onCloseTabs={onRequestCloseTabs}
            onSplit={splitTab}
            onSelect={handleSelectTab}
          />
        )}
      </div>
      {diffViewMode && onDiffViewModeChange && selectedDiff ? (
        <DiffTabActions
          diffPath={selectedDiff.path}
          mode={diffViewMode}
          onModeChange={onDiffViewModeChange}
          onOpenFile={handleOpenFile}
          onRevealNextChange={onRevealNextChange}
          onRevealPreviousChange={onRevealPreviousChange}
        />
      ) : null}
    </nav>
  )
}

function LegacyEditorTabList({
  drag,
  selectedTabRef,
  tabSizing,
  tabs,
  onClose,
  onCloseTabs,
  onSplit,
  onSelect,
}: {
  drag: EditorTabDragController
  selectedTabRef: RefObject<HTMLDivElement | null>
  tabSizing: Exclude<EditorTabSizing, 'chrome'>
  tabs: readonly EditorTabModel[]
  onClose: RequestCloseTab
  onCloseTabs: RequestCloseTabs
  onSplit: (tabId: string, direction: EditorPaneSplitDirection) => boolean
  onSelect: (tab: EditorTabModel) => void
}) {
  return (
    <div className='flex min-w-full flex-1 items-end'>
      {tabs.map((tab) => {
        const showCloseIcon = tab.active && !tab.dirty
        const insertionEdge = editorTabInsertionEdge(tabs, tab, drag.state)

        return (
          <ContextMenu key={tab.id}>
            <ContextMenuTrigger
              className={cn(
                'group relative flex h-10 cursor-grab items-center border-r border-border bg-background/40 text-xs active:cursor-grabbing',
                tabSizingClassName(tabSizing),
                tabDragClassName(insertionEdge, drag.draggedTabId === tab.id),
                tab.active && 'border-t-2 border-t-foreground bg-background text-foreground',
              )}
              data-editor-tab-id={tab.id}
              data-editor-tab-path={tab.path}
              draggable
              onDragEnd={drag.onDragEnd}
              onDragStart={(event) => drag.onDragStart(event, tab)}
              ref={tab.active ? selectedTabRef : undefined}
            >
              <button
                aria-selected={tab.active}
                className={cn(
                  'flex h-full min-w-0 flex-1 items-center gap-2 px-3 text-left text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50',
                  tab.active && 'text-foreground',
                )}
                onClick={() => onSelect(tab)}
                onDragEnd={drag.onDragEnd}
                onDragStart={(event) => {
                  event.stopPropagation()
                  drag.onDragStart(event, tab)
                }}
                draggable
                role='tab'
                title={tab.title}
                type='button'
              >
                <span
                  aria-hidden='true'
                  className='size-3.5 shrink-0 object-contain'
                  style={fileIconStyle(tab.icon)}
                />
                <span className='truncate'>{tab.name}</span>
                {tab.diffSuffix ? (
                  <span
                    aria-hidden='true'
                    className={cn(
                      'shrink-0 text-xs leading-none font-semibold tabular-nums',
                      tab.diffStatus?.className ?? 'text-muted-foreground',
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
                  'group/close relative mr-1 flex size-6 shrink-0 items-center justify-center text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50',
                  showCloseIcon || tab.dirty
                    ? 'opacity-100'
                    : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
                )}
                data-editor-tab-drag-blocker=''
                draggable={false}
                onClick={() => onClose(tab.id)}
                onDragStart={(event) => event.preventDefault()}
                title={`Close ${tab.name}`}
                type='button'
              >
                <XIcon
                  className={cn(
                    'size-3 transition-opacity',
                    showCloseIcon
                      ? 'opacity-70'
                      : 'opacity-0 group-hover:opacity-70 group-focus-visible/close:opacity-70',
                  )}
                />
                {tab.dirty ? (
                  <span
                    aria-hidden='true'
                    className='absolute size-2 rounded-full bg-amber-500 transition-opacity group-hover:opacity-0 group-focus-visible/close:opacity-0'
                  />
                ) : null}
              </button>
            </ContextMenuTrigger>
            <EditorTabContextMenuContent
              tab={tab}
              tabs={tabs}
              onCloseTabs={onCloseTabs}
              onSplit={onSplit}
            />
          </ContextMenu>
        )
      })}
    </div>
  )
}

function ChromeEditorTabList({
  drag,
  selectedTabRef,
  tabListRef,
  tabs,
  onClose,
  onCloseTabs,
  onSplit,
  onSelect,
}: {
  drag: EditorTabDragController
  selectedTabRef: RefObject<HTMLDivElement | null>
  tabListRef: RefObject<HTMLDivElement | null>
  tabs: readonly EditorChromeVisualTab[]
  onClose: RequestCloseTab
  onCloseTabs: RequestCloseTabs
  onSplit: (tabId: string, direction: EditorPaneSplitDirection) => boolean
  onSelect: (tab: EditorTabModel) => void
}) {
  const activeTabId = activeChromeTabId(tabs)
  const measuredAvailableWidth = useElementWidth(tabListRef)
  const [closeModeSpacerWidth, setCloseModeSpacerWidth] = useState(0)
  const [hoveredChromeTabId, setHoveredChromeTabId] = useState<string | null>(null)
  const [focusedChromeTabId, setFocusedChromeTabId] = useState<string | null>(null)
  const trailingSlotWidths = useMemo(
    () => chromeTrailingSlotWidths(tabs, hoveredChromeTabId, focusedChromeTabId),
    [focusedChromeTabId, hoveredChromeTabId, tabs],
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
  const tabModels = useMemo(() => tabs.map((visualTab) => visualTab.tab), [tabs])

  useLayoutEffect(() => {
    scrollSelectedTabIntoView(tabListRef.current, selectedTabRef.current)
  }, [activeTabId, selectedTabRef, tabListRef, tabs.length])

  useEffect(() => {
    if (closeModeSpacerWidth <= 0) return

    const timeout = window.setTimeout(() => {
      setCloseModeSpacerWidth(0)
    }, CHROME_TAB_GROW_DELAY_MS)

    return () => window.clearTimeout(timeout)
  }, [closeModeSpacerWidth])

  function handleClose(tabId: string, width: number | null) {
    const closed = onClose(tabId)
    if (!closed) return

    const nextSpacerWidth = nextCloseModeSpacerWidth(closeModeSpacerWidth, layout, width)
    setCloseModeSpacerWidth(nextSpacerWidth)
  }

  function handleChromeTabFocusChange(tabId: string, focused: boolean) {
    if (focused) {
      setFocusedChromeTabId(tabId)
      return
    }

    setFocusedChromeTabId((current) => (current === tabId ? null : current))
  }

  function handleChromeTabHoverChange(tabId: string, hovered: boolean) {
    if (hovered) {
      setHoveredChromeTabId(tabId)
      return
    }

    setHoveredChromeTabId((current) => (current === tabId ? null : current))
  }

  return (
    <div className='flex min-w-full items-end overflow-visible'>
      {tabs.map((visualTab, index) => {
        const hoveredOrFocused = chromeVisualTabHoveredOrFocused(
          visualTab,
          hoveredChromeTabId,
          focusedChromeTabId,
        )
        const insertionEdge = editorTabInsertionEdge(tabModels, visualTab.tab, drag.state)

        return (
          <ChromeEditorTab
            dragged={drag.draggedTabId === visualTab.tab.id}
            hoveredOrFocused={hoveredOrFocused}
            index={index}
            insertionEdge={insertionEdge}
            layoutWidth={layout?.tabs[index]?.width ?? null}
            key={visualTab.tab.id}
            overlap={overlap}
            tabs={tabModels}
            tabRef={visualTab.tab.active ? selectedTabRef : undefined}
            trailingSlotWidth={trailingSlotWidths[index] ?? 0}
            visualTab={visualTab}
            onClose={handleClose}
            onCloseTabs={onCloseTabs}
            onSplit={onSplit}
            onDragEnd={drag.onDragEnd}
            onDragStart={drag.onDragStart}
            onFocusChange={handleChromeTabFocusChange}
            onHoverChange={handleChromeTabHoverChange}
            onSelect={onSelect}
          />
        )
      })}
      <div aria-hidden='true' className='pointer-events-none' style={spacerStyle} />
    </div>
  )
}

function ChromeEditorTab({
  dragged,
  hoveredOrFocused,
  index,
  insertionEdge,
  layoutWidth,
  overlap,
  tabs,
  tabRef,
  trailingSlotWidth,
  visualTab,
  onClose,
  onCloseTabs,
  onSplit,
  onDragEnd,
  onDragStart,
  onFocusChange,
  onHoverChange,
  onSelect,
}: {
  dragged: boolean
  hoveredOrFocused: boolean
  index: number
  insertionEdge: EditorTabInsertionEdge
  layoutWidth: number | null
  overlap: number
  tabs: readonly EditorTabModel[]
  tabRef?: RefObject<HTMLDivElement | null>
  trailingSlotWidth: number
  visualTab: EditorChromeVisualTab
  onClose: (path: string, width: number | null) => void
  onCloseTabs: RequestCloseTabs
  onSplit: (tabId: string, direction: EditorPaneSplitDirection) => boolean
  onDragEnd: () => void
  onDragStart: EditorTabDragController['onDragStart']
  onFocusChange: (tabId: string, focused: boolean) => void
  onHoverChange: (tabId: string, hovered: boolean) => void
  onSelect: (tab: EditorTabModel) => void
}) {
  const tab = visualTab.tab
  const tabStyle = chromeTabStyle(visualTab, index, overlap, layoutWidth, trailingSlotWidth)

  return (
    <ContextMenu>
      <ContextMenuTrigger
        className={cn(
          'group group/chrome-tab relative flex cursor-grab items-center overflow-hidden border-x border-border/80 bg-muted/55 text-xs text-muted-foreground hover:z-20 hover:bg-background/70 active:cursor-grabbing',
          'z-[var(--chrome-tab-z)]',
          tabDragClassName(insertionEdge, dragged),
          tab.active && 'z-30 border-border bg-background text-foreground shadow-none',
        )}
        data-chrome-tab-root=''
        data-editor-tab-id={tab.id}
        data-editor-tab-path={tab.path}
        draggable
        onBlurCapture={(event) => {
          if (elementContainsTarget(event.currentTarget, event.relatedTarget)) return

          onFocusChange(tab.id, false)
        }}
        onDragEnd={onDragEnd}
        onDragStart={(event) => onDragStart(event, tab)}
        onFocusCapture={() => onFocusChange(tab.id, true)}
        onPointerEnter={() => onHoverChange(tab.id, true)}
        onPointerLeave={() => onHoverChange(tab.id, false)}
        ref={tabRef}
        style={tabStyle}
      >
        <button
          aria-selected={tab.active}
          className='focus-visible:ring-ring/50 flex h-full min-w-0 flex-1 items-center gap-1.5 py-0 pr-1.5 pl-3 text-left transition-colors outline-none focus-visible:ring-1'
          onClick={() => onSelect(tab)}
          onDragEnd={onDragEnd}
          onDragStart={(event) => {
            event.stopPropagation()
            onDragStart(event, tab)
          }}
          draggable
          role='tab'
          title={tab.title}
          type='button'
        >
          <span
            aria-hidden='true'
            className='size-3.5 shrink-0 object-contain'
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
      </ContextMenuTrigger>
      <EditorTabContextMenuContent
        tab={tab}
        tabs={tabs}
        onCloseTabs={onCloseTabs}
        onSplit={onSplit}
      />
    </ContextMenu>
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
      className='relative flex h-full shrink-0 items-center justify-center overflow-hidden'
      style={chromeTabTrailingSlotStyle(width)}
    >
      <button
        aria-label={`Close ${tab.name}`}
        className={cn(
          'group/close flex size-6 shrink-0 items-center justify-center rounded-[5px] text-muted-foreground transition-[background-color,color,opacity] outline-none hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50',
          showCloseIcon ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        data-editor-tab-drag-blocker=''
        draggable={false}
        onClick={(event) => {
          event.stopPropagation()
          onClose(tab.id, chromeTabRootWidth(event.currentTarget))
        }}
        onDragStart={(event) => event.preventDefault()}
        title={`Close ${tab.name}`}
        type='button'
      >
        <XIcon className='size-3 opacity-70' />
      </button>
      {tab.dirty ? (
        <span
          aria-hidden='true'
          className={cn(
            'pointer-events-none absolute size-2 rounded-full bg-amber-500 transition-opacity',
            showDirtyIndicator ? 'opacity-100' : 'opacity-0',
          )}
        />
      ) : null}
    </div>
  )
}

function ChromeTabTitle({ tab }: { tab: EditorTabModel }) {
  return (
    <span className='flex min-w-0 items-baseline gap-1 overflow-hidden whitespace-nowrap'>
      <span className='min-w-0 shrink truncate'>{tab.name}</span>
      {tab.diffSuffix ? (
        <span
          aria-hidden='true'
          className={cn(
            'shrink-0 text-xs leading-none font-semibold tabular-nums',
            tab.diffStatus?.className ?? 'text-muted-foreground',
          )}
          title={tab.diffStatus?.title}
        >
          {tab.diffSuffix}
        </span>
      ) : null}
    </span>
  )
}

function EditorTabContextMenuContent({
  tab,
  tabs,
  onCloseTabs,
  onSplit,
}: {
  tab: EditorTabModel
  tabs: readonly EditorTabModel[]
  onCloseTabs: RequestCloseTabs
  onSplit: (tabId: string, direction: EditorPaneSplitDirection) => boolean
}) {
  function handleClose(kind: EditorTabCloseTargetKind) {
    const tabIds = editorTabCloseTargetIds(tabs, tab.id, kind)
    if (tabIds.length === 0) return

    onCloseTabs(tabIds)
  }

  function handleCopyPath(path: string, label: string) {
    void copyTextToClipboard(path, label)
  }

  return (
    <ContextMenuContent className='w-52'>
      <ContextMenuItem onClick={() => handleClose('close')}>
        <XIcon />
        <span>Close</span>
      </ContextMenuItem>
      <ContextMenuItem
        disabled={editorTabCloseTargetIds(tabs, tab.id, 'closeOthers').length === 0}
        onClick={() => handleClose('closeOthers')}
      >
        <FilesIcon />
        <span>Close Others</span>
      </ContextMenuItem>
      <ContextMenuItem
        disabled={editorTabCloseTargetIds(tabs, tab.id, 'closeToRight').length === 0}
        onClick={() => handleClose('closeToRight')}
      >
        <ArrowRightIcon />
        <span>Close to the Right</span>
      </ContextMenuItem>
      <ContextMenuItem
        disabled={editorTabCloseTargetIds(tabs, tab.id, 'closeSaved').length === 0}
        onClick={() => handleClose('closeSaved')}
      >
        <FloppyDiskIcon />
        <span>Close Saved</span>
      </ContextMenuItem>
      <ContextMenuItem onClick={() => handleClose('closeAll')}>
        <XIcon />
        <span>Close All</span>
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => onSplit(tab.id, 'horizontal')}>
        <ColumnsIcon />
        <span>Split Right</span>
      </ContextMenuItem>
      <ContextMenuItem onClick={() => onSplit(tab.id, 'vertical')}>
        <RowsIcon />
        <span>Split Down</span>
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => handleCopyPath(tab.copyPath, 'path')}>
        <CopyIcon />
        <span>Copy Path</span>
      </ContextMenuItem>
      <ContextMenuItem onClick={() => handleCopyPath(tab.copyRelativePath, 'relative path')}>
        <CopyIcon />
        <span>Copy Relative Path</span>
      </ContextMenuItem>
    </ContextMenuContent>
  )
}

async function copyTextToClipboard(text: string, label: string) {
  if (!navigator.clipboard?.writeText) {
    toast.error('Clipboard is unavailable')
    return
  }

  try {
    await navigator.clipboard.writeText(text)
    toast.success(`Copied ${label}`)
  } catch (error) {
    reportClientError({
      area: 'editor-tabs',
      cause: error,
      context: { label },
      message: `Could not copy ${label}`,
      operation: 'copy-path',
    })
    toast.error(`Could not copy ${label}`)
  }
}

function useElementWidth<TElement extends HTMLElement>(ref: RefObject<TElement | null>) {
  const [width, setWidth] = useState<number | null>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    function updateWidth() {
      setWidth(element?.clientWidth ?? null)
    }

    updateWidth()

    if (!('ResizeObserver' in window)) return

    const observer = new ResizeObserver(updateWidth)
    observer.observe(element)

    return () => observer.disconnect()
  }, [ref])

  return width
}

function tabDragClassName(insertionEdge: EditorTabInsertionEdge, dragged: boolean) {
  return cn(
    'transition-opacity',
    dragged && 'opacity-45',
    insertionEdge === 'before' &&
      "before:pointer-events-none before:absolute before:top-1 before:bottom-1 before:left-0 before:z-40 before:w-0.5 before:rounded-full before:bg-ring before:content-['']",
    insertionEdge === 'after' &&
      "after:pointer-events-none after:absolute after:top-1 after:right-0 after:bottom-1 after:z-40 after:w-0.5 after:rounded-full after:bg-ring after:content-['']",
  )
}

function activeChromeTabId(visualTabs: readonly EditorChromeVisualTab[]) {
  return visualTabs.find((visualTab) => visualTab.tab.active)?.tab.id ?? null
}

function chromeTrailingSlotWidths(
  visualTabs: readonly EditorChromeVisualTab[],
  hoveredTabId: string | null,
  focusedTabId: string | null,
) {
  return visualTabs.map((visualTab) => {
    const hoveredOrFocused = chromeVisualTabHoveredOrFocused(visualTab, hoveredTabId, focusedTabId)
    if (!chromeTabHasTrailingSlot(visualTab.tab, hoveredOrFocused)) return 0

    return CHROME_TAB_TRAILING_SLOT_WIDTH
  })
}

function chromeVisualTabHoveredOrFocused(
  visualTab: EditorChromeVisualTab,
  hoveredTabId: string | null,
  focusedTabId: string | null,
) {
  const tabId = visualTab.tab.id

  return tabId === hoveredTabId || tabId === focusedTabId
}

function chromeTabHasTrailingSlot(tab: EditorTabModel, hoveredOrFocused: boolean) {
  return tab.active || tab.dirty || hoveredOrFocused
}

function chromeTabShowsCloseIcon(tab: EditorTabModel, hoveredOrFocused: boolean) {
  if (tab.dirty) return hoveredOrFocused

  return tab.active || hoveredOrFocused
}

function chromeTabShowsDirtyIndicator(tab: EditorTabModel, hoveredOrFocused: boolean) {
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
  return element.closest('[data-chrome-tab-root]')?.getBoundingClientRect().width ?? null
}

function elementContainsTarget(element: HTMLElement, target: EventTarget | null) {
  if (!(target instanceof Node)) return false

  return element.contains(target)
}

function nextCloseModeSpacerWidth(
  currentSpacerWidth: number,
  layout: ReturnType<typeof chromeTabLayout> | null,
  closedTabWidth: number | null,
) {
  if (closedTabWidth === null) return currentSpacerWidth

  const overlap = layout?.overlap ?? 0
  const closedTabAdvance = Math.max(0, closedTabWidth - overlap)

  return currentSpacerWidth + closedTabAdvance
}

function chromeTabStyle(
  visualTab: EditorChromeVisualTab,
  index: number,
  overlap: number,
  layoutWidth: number | null,
  trailingSlotWidth: number,
) {
  const tab = visualTab.tab
  const fixedWidth = closingOrOpeningTabWidth(visualTab)
  const targetWidth = fixedWidth ?? layoutWidth
  const minWidth = tab.active
    ? CHROME_TAB_ACTIVE_MIN_WIDTH + trailingSlotWidth
    : CHROME_TAB_INACTIVE_MIN_WIDTH + trailingSlotWidth

  return {
    '--chrome-tab-z': tab.active ? 30 : 1,
    flex: targetWidth === null ? '1 1 0px' : `0 0 ${targetWidth}px`,
    height: CHROME_TAB_HEIGHT,
    marginLeft: index === 0 ? 0 : -overlap,
    maxWidth: targetWidth ?? CHROME_TAB_STANDARD_WIDTH + trailingSlotWidth,
    minWidth: targetWidth ?? minWidth,
    transition: CHROME_TAB_TRANSITION,
    width: targetWidth ?? 'auto',
  } as CSSProperties
}

function closingOrOpeningTabWidth(visualTab: EditorChromeVisualTab) {
  if (visualTab.phase === 'opening') return CHROME_TAB_CLOSED_WIDTH

  return null
}

function sameEditorTabModel(left: EditorTabModel, right: EditorTabModel) {
  if (left.active !== right.active) return false
  if (left.copyPath !== right.copyPath) return false
  if (left.copyRelativePath !== right.copyRelativePath) return false
  if (left.dirty !== right.dirty) return false
  if (left.diffSuffix !== right.diffSuffix) return false
  if (left.icon.name !== right.icon.name) return false
  if (left.id !== right.id) return false
  if (left.name !== right.name) return false
  if (left.path !== right.path) return false
  if (left.title !== right.title) return false

  return sameDiffStatus(left.diffStatus, right.diffStatus)
}

function sameDiffStatus(
  left: ReturnType<typeof tabDiffStatus>,
  right: ReturnType<typeof tabDiffStatus>,
) {
  if (left?.className !== right?.className) return false
  if (left?.label !== right?.label) return false

  return left?.title === right?.title
}

function editorTabModel({
  conflicts,
  dirty,
  gitFiles,
  rootPath,
  selectedTabId,
  tab,
}: {
  conflicts: Readonly<Record<string, { remotePath: string }>>
  dirty: boolean
  gitFiles: readonly FileStatus[]
  rootPath: string
  selectedTabId: string | null
  tab: EditorPaneTab
}): EditorTabModel {
  const path = tab.path
  const diffStatus = tabDiffStatus(path, gitFiles, rootPath)
  const diffHash = diffDocumentShortHash(path)
  const copyPath = tabCopyPath(path, conflicts)

  return {
    active: tab.id === selectedTabId,
    copyPath,
    copyRelativePath: tabRelativeCopyPath(copyPath, rootPath),
    diffStatus,
    diffSuffix: tabDiffSuffix(diffHash, diffStatus?.label),
    dirty,
    id: tab.id,
    icon: iconForEntry({
      name: iconName(path, conflicts),
      type: 'file',
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
    <div className='bg-background/40 flex h-full shrink-0 items-center gap-0.5 border-l px-1'>
      <RevealChangeButton direction='previous' onRevealChange={onRevealPreviousChange} />
      <RevealChangeButton direction='next' onRevealChange={onRevealNextChange} />
      <OpenOriginalFileButton path={diffPath} onOpenFile={onOpenFile} />
      <DiffViewModeToggle mode={mode} onModeChange={onModeChange} />
    </div>
  )
}

function RevealChangeButton({
  direction,
  onRevealChange,
}: {
  direction: 'previous' | 'next'
  onRevealChange?: () => void
}) {
  const label = `${capitalize(direction)} change`
  const Icon = direction === 'previous' ? ArrowUpIcon : ArrowDownIcon

  return (
    <ToolbarIconButton disabled={!onRevealChange} label={label} onClick={() => onRevealChange?.()}>
      <Icon className='size-3.5' />
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
      <FileIcon className='size-3.5' />
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
            className='text-muted-foreground hover:text-foreground size-7'
            disabled={disabled}
            onClick={onClick}
            size='icon-sm'
            title={label}
            type='button'
            variant='ghost'
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
  if (mode === 'stacked') return <RowsIcon className='size-3.5' />

  return <ColumnsIcon className='size-3.5' />
}

function iconName(path: string, conflicts: Readonly<Record<string, { remotePath: string }>>) {
  const diff = parseDiffDocumentId(path)
  const searchBuffer = parseSearchBufferDocumentId(path)
  if (searchBuffer) return 'search.txt'
  if (diff) return basename(diff.path)
  const conflict = conflictForDocument(path, conflicts)
  if (conflict) return basename(conflict.remotePath)
  if (parseConflictDiffDocumentId(path)) return 'conflict.txt'

  return basename(path)
}

function tabName(path: string, conflicts: Readonly<Record<string, { remotePath: string }>>) {
  if (parseDiffDocumentId(path)) return diffDocumentLabel(path)
  if (parseSearchBufferDocumentId(path)) return searchBufferDocumentLabel()
  const conflict = conflictForDocument(path, conflicts)
  if (conflict) return conflictDiffDocumentLabel(conflict.remotePath)
  if (parseConflictDiffDocumentId(path)) return 'Conflict'

  return basename(path)
}

function tabTitle(path: string, conflicts: Readonly<Record<string, { remotePath: string }>>) {
  if (parseDiffDocumentId(path)) return diffDocumentTitle(path)
  const searchBuffer = parseSearchBufferDocumentId(path)
  if (searchBuffer) return searchBufferDocumentTitle(searchBuffer.rootPath)
  const conflict = conflictForDocument(path, conflicts)
  if (conflict) return conflictDiffDocumentTitle(conflict.remotePath)
  if (parseConflictDiffDocumentId(path)) return 'Filesystem conflict editor'

  return displayPath(path)
}

function tabCopyPath(path: string, conflicts: Readonly<Record<string, { remotePath: string }>>) {
  const diff = parseDiffDocumentId(path)
  if (diff) return diff.path

  const searchBuffer = parseSearchBufferDocumentId(path)
  if (searchBuffer) return searchBuffer.rootPath

  const conflict = conflictForDocument(path, conflicts)
  if (conflict) return conflict.remotePath

  return path
}

function tabRelativeCopyPath(path: string, rootPath: string) {
  const normalizedPath = normalizedCopyPath(path)
  const normalizedRoot = normalizedCopyPath(rootPath)
  if (!normalizedRoot) return normalizedPath
  if (normalizedPath === normalizedRoot) return basename(normalizedPath)

  const rootPrefix = `${normalizedRoot}/`
  if (!normalizedPath.startsWith(rootPrefix)) return normalizedPath

  return normalizedPath.slice(rootPrefix.length)
}

function normalizedCopyPath(path: string) {
  if (path === '/') return path

  return path.replace(/\/+$/u, '')
}

function tabDiffStatus(path: string, files: readonly FileStatus[], rootPath: string) {
  if (parseConflictDiffDocumentId(path)) return null
  if (parseSearchBufferDocumentId(path)) return null

  const diff = parseDiffDocumentId(path)
  if (!diff) return null

  const file = files.find((file) => diffStatusMatchesFile(diff, file, rootPath))
  const live = file ? liveSymbolForDiff(diff, file) : null
  if (live) return live
  if (diff.kind !== 'snapshot' || !diff.status) return null

  return gitStatusSymbol(diff.status, 'historical')
}

function conflictForDocument(
  path: string | null | undefined,
  conflicts: Readonly<Record<string, { remotePath: string }>>,
) {
  const conflictDiff = parseConflictDiffDocumentId(path)
  if (!conflictDiff) return null

  return conflicts[conflictDiff.conflictId] ?? null
}

function tabDiffSuffix(hash: string, status: string | undefined) {
  if (!hash) return ''
  if (!status) return `(${hash})`

  return `(${hash} ${status})`
}

function diffStatusMatchesFile(
  diff: NonNullable<ReturnType<typeof parseDiffDocumentId>>,
  file: FileStatus,
  rootPath: string,
) {
  return pathSetsOverlap(diffStatusPaths(diff), statusPaths(file), rootPath)
}

const EMPTY_GIT_FILES: readonly FileStatus[] = []

function liveSymbolForDiff(
  diff: NonNullable<ReturnType<typeof parseDiffDocumentId>>,
  file: FileStatus,
) {
  const preferred = diff.kind === 'snapshot' ? diff.source : undefined
  const source = liveSymbolSource(file, preferred)
  if (!source) return null

  return gitStatusSymbol(statusForSymbolSource(file, source), source)
}

function liveSymbolSource(
  file: FileStatus,
  preferred: GitSymbolSource | undefined,
): GitSymbolSource | null {
  if (preferred === 'staged' && isStagedStatus(file.index)) return 'staged'
  if (preferred === 'worktree' && isWorktreeStatus(file.worktree)) return 'worktree'
  if (isStagedStatus(file.index)) return 'staged'
  if (isWorktreeStatus(file.worktree)) return 'worktree'

  return null
}

function statusForSymbolSource(file: FileStatus, source: GitSymbolSource) {
  if (source === 'staged') return file.index
  if (source === 'worktree') return file.worktree

  return file.status
}

function isStagedStatus(status: FileStatus['index']) {
  return status !== 'unmodified' && status !== 'untracked'
}

function isWorktreeStatus(status: FileStatus['worktree']) {
  return status !== 'unmodified'
}

function diffStatusPaths(diff: NonNullable<ReturnType<typeof parseDiffDocumentId>>) {
  if (diff.kind === 'legacy') return [diff.path]

  return [diff.path, diff.query.oldPath].filter(isPresentPath)
}

function statusPaths(file: FileStatus) {
  return [file.path, file.oldPath].filter(isPresentPath)
}

function isPresentPath(path: string | undefined): path is string {
  return Boolean(path)
}

function pathSetsOverlap(left: readonly string[], right: readonly string[], rootPath: string) {
  const normalizedRight = new Set(right.flatMap((path) => comparablePaths(path, rootPath)))

  return left.some((path) =>
    comparablePaths(path, rootPath).some((candidate) => normalizedRight.has(candidate)),
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

  return Array.from(new Set(paths.filter(Boolean)))
}

function normalizePath(path: string) {
  return path.replace(/\/+/gu, '/').replace(/\/$/u, '')
}

function stripLeadingSlash(path: string) {
  return path.startsWith('/') ? path.slice(1) : path
}

function tabSizingClassName(tabSizing: EditorTabSizing) {
  if (tabSizing === 'fixed') return 'min-w-[50px] max-w-40 flex-[1_0_0]'
  if (tabSizing === 'shrink') return 'min-w-20 max-w-fit basis-0 grow'

  return 'w-[120px] min-w-fit shrink-0'
}

function scrollSelectedTabIntoView(tabList: HTMLElement | null, selectedTab: HTMLElement | null) {
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
