import "@editor/core/style.css"
import "@editor/find/style.css"

import { ArrowSquareOutIcon, CaretRightIcon } from "@phosphor-icons/react"
import type {
  BrowserTextMetrics,
  EditorKeymapLayer,
  EditorKeymapOptions,
  EditorPlugin,
  EditorRangeDecoration,
  EditorTheme,
} from "@editor/core"
import { createEditorFindPlugin } from "@editor/find"
import { EditorHost, useEditor } from "@editor/react"
import type { WorkspaceSearchMatch } from "@workspace/contracts"
import {
  useEffect,
  useId,
  useLayoutEffect,
  useCallback,
  memo,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
  type UIEvent,
} from "react"

import { useWorkspaceFocus } from "@/components/workspace/workspace-focus-state"
import { createEditorSyntaxHighlightingPlugins } from "@/features/editor/editor-plugins"
import { useEditorShikiTheme } from "@/features/editor/hooks/use-editor-shiki-theme"
import type { WorkspaceSearchFileGroup } from "@/features/search/search-buffer-state"
import {
  nextSearchResultFileEditorPoolKeys,
  searchResultFileEditorPoolKeysEqual,
} from "@/features/search/search-result-editor-pool"
import {
  colorForFileIcon,
  iconForEntry,
  type ResolvedFileIcon,
} from "@/lib/file-icons"
import {
  firstSearchResultExcerptId,
  firstSearchResultVirtualRowId,
  lastSearchResultVirtualRowId,
  parentSearchResultFileId,
  searchResultFileDocument,
  searchResultFileDocumentLineAtRow,
  searchResultFileDocumentLineById,
  searchResultFileBlocks,
  searchResultOpenTargetForId,
  searchResultVirtualRowById,
  searchResultVirtualRowContainsId,
  searchResultVirtualRowId,
  searchResultVirtualRowIdByOffset,
  searchResultVirtualRows,
  type SearchResultFileDocument,
  type SearchResultFileDocumentLine,
  type SearchResultFileBlock,
  type SearchResultOpenTarget,
  type SearchResultRange,
  type SearchResultVirtualRow,
} from "@/features/search/search-result-view-model"
import type { SearchResultId } from "@/features/search/search-result-items"
import {
  clampSearchResultVirtualListScrollTop,
  createSearchResultVirtualListMetrics,
  scrollTopForSearchResultVirtualListItem,
  visibleSearchResultVirtualListItems,
  type SearchResultVirtualListMetrics,
  type SearchResultVirtualListViewport,
} from "@/features/search/search-result-virtual-list"
import { readonlyEditorKeymapLayers } from "@/keymap"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

const FILE_ROW_ESTIMATE = 44
const EXCERPT_EDITOR_LINE_HEIGHT = 22
const EXCERPT_EDITOR_CHARACTER_WIDTH = 8
const SEARCH_RESULT_FILE_EDITOR_ROW_GAP = 6
const SEARCH_RESULT_VIRTUAL_FALLBACK_COUNT = 8
const SEARCH_RESULT_VIRTUAL_MIN_OVERSCAN = 320
const SEARCH_RESULT_VIRTUAL_PADDING = 12
const SEARCH_RESULT_VIRTUAL_ROW_OFFSET = 6
const INITIAL_SEARCH_RESULT_VIRTUAL_VIEWPORT = {
  height: 0,
  top: 0,
} satisfies SearchResultVirtualListViewport
const FILE_RESULTS_EDITOR_MIN_HEIGHT = 28
const FILE_RESULTS_ROW_VERTICAL_PADDING = 8

const PASSIVE_MATCH_STYLE = {
  backgroundColor: "var(--search-result-match-background)",
} satisfies Partial<CSSStyleDeclaration>

const ACTIVE_MATCH_STYLE = {
  backgroundColor: "var(--search-result-match-active-background)",
  textDecoration: "underline 1px var(--search-result-match-active-decoration)",
} satisfies Partial<CSSStyleDeclaration>

const PENDING_MATCH_STYLE = {
  opacity: "0.55",
} satisfies Partial<CSSStyleDeclaration>

const SEARCH_RESULT_FILE_EDITOR_POOL_HIDDEN_STYLE = {
  contain: "layout paint style",
  display: "none",
  pointerEvents: "none",
} satisfies CSSProperties

const SEARCH_RESULT_CURSOR_LINE_HIGHLIGHT = {
  gutterBackground: false,
  gutterNumber: false,
  rowBackground: false,
} as const
const EMPTY_EDITOR_PLUGINS: readonly EditorPlugin[] = []
const EMPTY_RANGE_DECORATIONS: readonly EditorRangeDecoration[] = []
const SEARCH_RESULT_FILE_EDITOR_TEXT_METRICS = {
  characterWidth: EXCERPT_EDITOR_CHARACTER_WIDTH,
  rowHeight: EXCERPT_EDITOR_LINE_HEIGHT,
} satisfies BrowserTextMetrics
const SEARCH_RESULT_INACTIVE_EDITOR_KEYMAP = {
  enabled: false,
} satisfies EditorKeymapOptions

type SearchResultEditorSurfaceProps = {
  activeResultId: SearchResultId | null
  canReplace?: boolean
  deferredPluginMode?: SearchResultDeferredPluginMode
  displayedResultsQuery: string | null
  groups: readonly WorkspaceSearchFileGroup[]
  keymapLayers: readonly EditorKeymapLayer[]
  pendingResultIds?: readonly SearchResultId[]
  prewarmEditorPool?: boolean
  replaceVisible: boolean
  resultsQuery: string
  onOpenTarget: (target: SearchResultOpenTarget) => void
  onReplaceGroup?: (group: WorkspaceSearchFileGroup) => void
  onReplaceMatch?: (match: WorkspaceSearchMatch) => void
  onSelectResult: (id: SearchResultId | null) => void
  onToggleGroup: (path: string) => void
}

type SearchResultDeferredPluginMode = "idle" | "immediate" | "manual"

export const SearchResultEditorSurface = memo(
  ({
    activeResultId,
    canReplace,
    deferredPluginMode = "immediate",
    displayedResultsQuery,
    groups,
    keymapLayers,
    pendingResultIds,
    prewarmEditorPool = true,
    replaceVisible,
    resultsQuery,
    onOpenTarget,
    onReplaceGroup,
    onReplaceMatch,
    onSelectResult,
    onToggleGroup,
  }: SearchResultEditorSurfaceProps) => {
    const treeId = useId()
    const parentRef = useRef<HTMLDivElement | null>(null)
    const setFocusArea = useWorkspaceFocus((state) => state.setFocusArea)
    const setActiveEditorCommandDispatch = useWorkspaceFocus(
      (state) => state.setActiveEditorCommandDispatch
    )
    const readonlyKeymapLayers = useMemo(
      () => readonlyEditorKeymapLayers(keymapLayers),
      [keymapLayers]
    )
    const blocks = useMemo(
      () => searchResultFileBlocks(groups, resultsQuery, { pendingResultIds }),
      [groups, pendingResultIds, resultsQuery]
    )
    const rows = useMemo(() => searchResultVirtualRows(blocks), [blocks])
    const groupByPath = useMemo(() => groupMap(groups), [groups])
    const activeRow = useMemo(
      () => searchResultVirtualRowById(rows, activeResultId),
      [activeResultId, rows]
    )
    const activeIndex = useMemo(
      () => searchResultVirtualRowIndex(rows, activeResultId),
      [activeResultId, rows]
    )
    const activeScrollTarget = useMemo(
      () => searchResultVirtualRowScrollTarget(activeRow, activeResultId),
      [activeResultId, activeRow]
    )
    const suppressNextActiveRevealRef = useRef(false)
    const previousDisplayedResultsQueryRef = useRef<string | null>(null)
    const activeIndexRef = useRef(activeIndex)
    const activeScrollTargetRef = useRef(activeScrollTarget)
    const { editorThemeRefresh, shikiThemeResolver } = useEditorShikiTheme()
    const deferredPlugins = useSearchResultDeferredPlugins({
      mode: deferredPluginMode,
      resultKey: displayedResultsQuery,
      rowCount: rows.length,
      shikiThemeResolver,
    })

    const {
      items: virtualItems,
      onScroll: handleVirtualScroll,
      scrollToIndex,
      scrollToOffset,
      totalSize: virtualTotalSize,
    } = useSearchResultEditorVirtualizer(rows, parentRef)
    const renderedVirtualItems = useMemo(
      () => searchResultRenderedVirtualItems(virtualItems, rows),
      [rows, virtualItems]
    )
    const fileResultItems = useMemo(
      () => renderedVirtualItems.filter(isSearchResultRenderedFileResultItem),
      [renderedVirtualItems]
    )
    const fileEditorPoolEntries = useSearchResultFileEditorPoolEntries(
      fileResultItems,
      prewarmEditorPool
    )
    const scrollToIndexRef = useRef(scrollToIndex)
    const selectResultWithoutReveal = useCallback(
      (id: SearchResultId | null) => {
        if (id === activeResultId) return

        suppressNextActiveRevealRef.current = true
        onSelectResult(id)
      },
      [activeResultId, onSelectResult]
    )

    useLayoutEffect(() => {
      activeIndexRef.current = activeIndex
      activeScrollTargetRef.current = activeScrollTarget
      scrollToIndexRef.current = scrollToIndex
    }, [activeIndex, activeScrollTarget, scrollToIndex])

    useLayoutEffect(() => {
      if (!activeResultId) return
      if (suppressNextActiveRevealRef.current) {
        suppressNextActiveRevealRef.current = false
        return
      }

      scrollActiveSearchResultIntoView({
        activeIndexRef,
        activeScrollTargetRef,
        scrollToIndexRef,
      })
    }, [activeResultId])

    useLayoutEffect(() => {
      if (displayedResultsQuery === null) return
      if (previousDisplayedResultsQueryRef.current === displayedResultsQuery)
        return

      previousDisplayedResultsQueryRef.current = displayedResultsQuery
      resetSearchResultScroll(parentRef, scrollToOffset)
      const frame = window.requestAnimationFrame(() =>
        resetSearchResultScroll(parentRef, scrollToOffset)
      )

      return () => window.cancelAnimationFrame(frame)
    }, [displayedResultsQuery, scrollToOffset])

    useEffect(() => {
      if (activeRow?.type === "file-results") return

      setActiveEditorCommandDispatch(null)
    }, [activeRow, setActiveEditorCommandDispatch])

    function handleReplaceFile(path: string) {
      const group = groupByPath.get(path)
      if (!group) return

      onReplaceGroup?.(group)
    }

    function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
      handleSearchResultSurfaceKeyDown({
        activeResultId,
        blocks,
        event,
        onOpenTarget,
        onSelectResult,
        onToggleGroup,
        rows,
      })
    }

    return (
      <div
        aria-activedescendant={
          activeRow
            ? searchResultDomId(treeId, searchResultVirtualRowId(activeRow))
            : undefined
        }
        aria-label="Search result editor"
        className="app-scrollbar-thin min-h-0 overflow-x-hidden overflow-y-auto bg-background"
        ref={parentRef}
        role="tree"
        tabIndex={0}
        onFocusCapture={() => setFocusArea("editor")}
        onKeyDown={handleKeyDown}
        onPointerDownCapture={() => setFocusArea("editor")}
        onScroll={handleVirtualScroll}
      >
        <div
          className="relative"
          style={{ height: virtualTotalSize + SEARCH_RESULT_VIRTUAL_PADDING }}
        >
          {renderedVirtualItems.map(({ renderKey, row, virtualItem }) => {
            if (row.type !== "file") return null

            const id = searchResultVirtualRowId(row)
            const active = searchResultVirtualRowContainsId(row, activeResultId)

            return (
              <div
                aria-expanded={searchResultVirtualRowExpanded(row)}
                aria-level={1}
                aria-selected={active}
                className="absolute right-2 left-2"
                data-index={virtualItem.index}
                id={searchResultDomId(treeId, id)}
                key={renderKey}
                role="treeitem"
                style={searchResultVirtualRowStyle(virtualItem)}
                onMouseDown={() => onSelectResult(id)}
              >
                <SearchResultFileHeader
                  active={active}
                  canReplace={canReplace}
                  file={row.file}
                  pending={row.file.pending}
                  replaceVisible={replaceVisible}
                  onOpen={() =>
                    onOpenTarget({ match: null, path: row.file.path })
                  }
                  onReplace={() => handleReplaceFile(row.file.path)}
                  onToggle={() => onToggleGroup(row.file.path)}
                />
              </div>
            )
          })}
          {fileEditorPoolEntries.map((entry) => (
            <SearchResultFileEditorPoolSlot
              activeResultId={activeResultId}
              canReplace={canReplace}
              deferredPluginsReady={deferredPlugins.ready}
              editorTheme={editorThemeRefresh}
              entry={entry}
              key={`file-results-pool:${entry.key}`}
              keymapLayers={readonlyKeymapLayers}
              replaceVisible={replaceVisible}
              syntaxPlugins={deferredPlugins.syntaxPlugins}
              treeId={treeId}
              onEnableDeferredPlugins={deferredPlugins.enable}
              onOpenTarget={onOpenTarget}
              onReplaceMatch={onReplaceMatch}
              onSelectResultWithoutReveal={selectResultWithoutReveal}
            />
          ))}
        </div>
      </div>
    )
  }
)
SearchResultEditorSurface.displayName = "SearchResultEditorSurface"

function SearchResultFileHeader({
  active,
  canReplace,
  file,
  pending,
  replaceVisible,
  onOpen,
  onReplace,
  onToggle,
}: {
  active: boolean
  canReplace?: boolean
  file: SearchResultFileBlock
  pending?: boolean
  replaceVisible: boolean
  onOpen: () => void
  onReplace: () => void
  onToggle: () => void
}) {
  const name = fileName(file.path)
  const icon = useMemo(() => iconForEntry({ name, type: "file" }), [name])

  return (
    <div
      className={cn(
        "grid w-full grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] items-center gap-1.5 rounded-sm border-l border-transparent px-2 py-1.5 text-left",
        active &&
          "bg-muted/70 shadow-[inset_0_1px_0_color-mix(in_oklch,var(--border)_55%,transparent)]",
        pending && "opacity-55",
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
        {matchCountLabel(file.matchCount)}
      </span>
      <Button
        aria-label="Open file"
        size="icon-xs"
        title="Open file"
        type="button"
        variant="ghost"
        onClick={onOpen}
      >
        <ArrowSquareOutIcon className="size-3.5" />
      </Button>
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

function SearchResultFileEditorPoolSlot({
  activeResultId,
  canReplace,
  deferredPluginsReady,
  editorTheme,
  entry,
  keymapLayers,
  replaceVisible,
  syntaxPlugins,
  treeId,
  onEnableDeferredPlugins,
  onOpenTarget,
  onReplaceMatch,
  onSelectResultWithoutReveal,
}: {
  activeResultId: SearchResultId | null
  canReplace?: boolean
  deferredPluginsReady: boolean
  editorTheme: EditorTheme
  entry: SearchResultFileEditorPoolEntry
  keymapLayers: readonly EditorKeymapLayer[]
  replaceVisible: boolean
  syntaxPlugins: readonly EditorPlugin[]
  treeId: string
  onEnableDeferredPlugins: () => void
  onOpenTarget: (target: SearchResultOpenTarget) => void
  onReplaceMatch?: (match: WorkspaceSearchMatch) => void
  onSelectResultWithoutReveal: (id: SearchResultId | null) => void
}) {
  const { item, visible } = entry
  const row = item.row
  const file = row.file
  const id = searchResultVirtualRowId(row)
  const active =
    visible && searchResultVirtualRowContainsId(row, activeResultId)

  return (
    <div
      aria-hidden={visible ? undefined : true}
      aria-level={visible ? 2 : undefined}
      aria-selected={visible ? active : undefined}
      className="absolute right-2 left-2"
      data-index={visible ? item.virtualItem.index : undefined}
      id={id && visible ? searchResultDomId(treeId, id) : undefined}
      role={visible ? "treeitem" : undefined}
      style={
        visible
          ? searchResultVirtualRowStyle(item.virtualItem)
          : SEARCH_RESULT_FILE_EDITOR_POOL_HIDDEN_STYLE
      }
    >
      <SearchResultFileEditor
        active={active}
        activeResultId={active ? activeResultId : null}
        canReplace={canReplace}
        deferredPluginsReady={deferredPluginsReady}
        editorTheme={editorTheme}
        file={file}
        keymapLayers={keymapLayers}
        replaceVisible={replaceVisible}
        syntaxPlugins={syntaxPlugins}
        visible={visible}
        onEnableDeferredPlugins={onEnableDeferredPlugins}
        onOpenTarget={onOpenTarget}
        onReplaceMatch={onReplaceMatch}
        onSelectResultWithoutReveal={onSelectResultWithoutReveal}
      />
    </div>
  )
}

type SearchResultFileEditorProps = {
  active: boolean
  activeResultId: SearchResultId | null
  canReplace?: boolean
  editorTheme: EditorTheme
  file: SearchResultFileBlock
  keymapLayers: readonly EditorKeymapLayer[]
  replaceVisible: boolean
  deferredPluginsReady: boolean
  syntaxPlugins: readonly EditorPlugin[]
  visible: boolean
  onEnableDeferredPlugins: () => void
  onOpenTarget: (target: SearchResultOpenTarget) => void
  onReplaceMatch?: (match: WorkspaceSearchMatch) => void
  onSelectResultWithoutReveal: (id: SearchResultId | null) => void
}

const SearchResultFileEditor = memo(
  ({
    active,
    activeResultId,
    canReplace,
    editorTheme,
    file,
    keymapLayers,
    replaceVisible,
    deferredPluginsReady,
    syntaxPlugins,
    visible,
    onEnableDeferredPlugins,
    onOpenTarget,
    onReplaceMatch,
    onSelectResultWithoutReveal,
  }: SearchResultFileEditorProps) => {
    const setFocusArea = useWorkspaceFocus((state) => state.setFocusArea)
    const setActiveEditorCommandDispatch = useWorkspaceFocus(
      (state) => state.setActiveEditorCommandDispatch
    )
    const fileDocument = useMemo(() => searchResultFileDocument(file), [file])
    const sourceLineDigits = fileBlockLineDigits(file)
    const document = useMemo(
      () => ({
        documentId: searchResultFileDocumentId(file),
        documentMode: "static" as const,
        languageId: fileDocument.languageId,
        text: fileDocument.text,
        textSyncMode: "incremental" as const,
      }),
      [file, fileDocument]
    )
    const rangeDecorations = useMemo(
      () =>
        visible
          ? searchResultFileRangeDecorations(fileDocument, activeResultId)
          : EMPTY_RANGE_DECORATIONS,
      [activeResultId, fileDocument, visible]
    )
    const findPlugin = useMemo(() => {
      if (!active) return null
      if (!visible) return null
      if (!deferredPluginsReady) return null

      return createEditorFindPlugin()
    }, [active, deferredPluginsReady, visible])
    const effectiveSyntaxPlugins = visible
      ? syntaxPlugins
      : EMPTY_EDITOR_PLUGINS
    const plugins = useMemo(
      () => fileResultEditorPlugins(effectiveSyntaxPlugins, findPlugin),
      [effectiveSyntaxPlugins, findPlugin]
    )
    const editorKeymap = useMemo(
      () =>
        active
          ? ({
              defaultBindings: false,
              layers: keymapLayers,
            } satisfies EditorKeymapOptions)
          : SEARCH_RESULT_INACTIVE_EDITOR_KEYMAP,
      [active, keymapLayers]
    )
    const editorStyle = useMemo(
      () => searchResultFileEditorStyle(fileDocument),
      [fileDocument]
    )
    const controller = useEditor({
      cursorLineHighlight: SEARCH_RESULT_CURSOR_LINE_HIGHLIGHT,
      document,
      editability: "readonly",
      keymap: editorKeymap,
      lineHeight: EXCERPT_EDITOR_LINE_HEIGHT,
      plugins,
      rangeDecorations,
      rowGap: SEARCH_RESULT_FILE_EDITOR_ROW_GAP,
      selectionSyncMode: "none",
      storeSync: "none",
      textMetrics: SEARCH_RESULT_FILE_EDITOR_TEXT_METRICS,
      theme: editorTheme,
    })
    const pendingActivationFrameRef = useRef<number | null>(null)

    useEffect(() => {
      if (!active) return

      setActiveEditorCommandDispatch(controller.commands.dispatchCommand)
      return () => setActiveEditorCommandDispatch(null)
    }, [active, controller, setActiveEditorCommandDispatch])

    useEffect(
      () => () => {
        if (pendingActivationFrameRef.current === null) return

        window.cancelAnimationFrame(pendingActivationFrameRef.current)
      },
      []
    )

    useEffect(() => {
      if (!active) return

      const line = searchResultFileDocumentLineById(
        fileDocument,
        activeResultId
      )
      if (!line) return

      const range = searchResultFileDocumentLineSelection(line)
      controller.commands.setSelection(range.start, range.end, {
        reveal: false,
      })
    }, [active, activeResultId, controller, fileDocument])

    function handleActivate() {
      onEnableDeferredPlugins()
      setFocusArea("editor")
    }

    function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
      if (isSearchResultEditorActionTarget(event.target)) return

      if (pendingActivationFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingActivationFrameRef.current)
      }
      pendingActivationFrameRef.current = window.requestAnimationFrame(() => {
        pendingActivationFrameRef.current = null
        onSelectResultWithoutReveal(file.id)
      })
    }

    function handleKeyDownCapture(event: KeyboardEvent<HTMLDivElement>) {
      if (openFileResultOnEnter(event, handleOpen)) return
      if (!readonlyEditingKey(event)) return

      event.preventDefault()
      event.stopPropagation()
    }

    function handleOpen() {
      const line = currentSearchResultFileLine(fileDocument, controller)
      if (!line) return

      onOpenTarget({
        match: line.sourceMatch,
        path: file.path,
      })
    }

    function handleReplace() {
      const line = currentSearchResultFileLine(fileDocument, controller)
      if (!line) return

      onReplaceMatch?.(line.sourceMatch)
    }

    function handleReplaceClick(event: MouseEvent<HTMLButtonElement>) {
      event.stopPropagation()
      handleReplace()
    }

    return (
      <div
        className={cn(
          "ml-5 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-1.5 rounded-sm border-l border-transparent px-2 py-0.5",
          active && "bg-muted/60"
        )}
        onBeforeInputCapture={preventReadonlyInput}
        onDropCapture={preventReadonlyInput}
        onFocusCapture={handleActivate}
        onKeyDownCapture={handleKeyDownCapture}
        onPasteCapture={preventReadonlyInput}
        onPointerDownCapture={handleActivate}
        onPointerUpCapture={handlePointerUp}
      >
        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start">
          <SearchResultSourceLineGutter
            document={fileDocument}
            minDigits={sourceLineDigits}
          />
          <EditorHost
            className="app-editor-host search-result-file-editor-host min-w-0"
            controller={controller}
            style={editorStyle}
          />
        </div>
        {replaceVisible ? (
          <Button
            className="mt-0.5 h-6 px-1.5 text-[10px]"
            disabled={!canReplace}
            size="xs"
            title="Replace selected match"
            type="button"
            variant="ghost"
            onClick={handleReplaceClick}
          >
            Replace
          </Button>
        ) : null}
      </div>
    )
  }
)
SearchResultFileEditor.displayName = "SearchResultFileEditor"

function SearchResultSourceLineGutter({
  document,
  minDigits,
}: {
  document: SearchResultFileDocument
  minDigits: number
}) {
  return (
    <div
      aria-hidden="true"
      className="box-border grid shrink-0 overflow-hidden pr-2 text-right font-mono text-[13px] text-muted-foreground select-none"
      style={searchResultSourceLineGutterStyle(
        document.lines.length,
        minDigits
      )}
    >
      {document.lines.map((line) => (
        <span
          className="block overflow-hidden leading-[22px] tabular-nums"
          key={line.id}
        >
          {line.sourceLine}
        </span>
      ))}
    </div>
  )
}

function useSearchResultDeferredPlugins({
  mode,
  resultKey,
  rowCount,
  shikiThemeResolver,
}: {
  mode: SearchResultDeferredPluginMode
  resultKey: string | null
  rowCount: number
  shikiThemeResolver: () => string
}) {
  const deferKey = `${resultKey ?? ""}:${rowCount}`
  const [deferredSyntax, setDeferredSyntax] = useState({
    key: "",
    ready: false,
  })
  const ready =
    mode === "immediate" ||
    (deferredSyntax.key === deferKey && deferredSyntax.ready)
  const enable = useCallback(() => {
    setDeferredSyntax((current) => {
      if (current.key === deferKey && current.ready) return current

      return { key: deferKey, ready: true }
    })
  }, [deferKey])

  useEffect(() => {
    if (mode !== "idle") return
    if (ready) return

    return scheduleSearchResultSyntaxEnable(enable)
  }, [enable, mode, ready])

  const syntaxPlugins = useMemo(() => {
    if (!ready) return []

    return createEditorSyntaxHighlightingPlugins(shikiThemeResolver)
  }, [ready, shikiThemeResolver])

  return {
    enable,
    ready,
    syntaxPlugins,
  }
}

function fileResultEditorPlugins(
  syntaxPlugins: readonly EditorPlugin[],
  findPlugin: EditorPlugin | null
) {
  if (syntaxPlugins.length === 0 && !findPlugin) return EMPTY_EDITOR_PLUGINS

  if (!findPlugin) return [...syntaxPlugins]

  return [...syntaxPlugins, findPlugin]
}

function handleSearchResultSurfaceKeyDown({
  activeResultId,
  blocks,
  event,
  onOpenTarget,
  onSelectResult,
  onToggleGroup,
  rows,
}: {
  activeResultId: SearchResultId | null
  blocks: readonly SearchResultFileBlock[]
  event: KeyboardEvent<HTMLDivElement>
  onOpenTarget: (target: SearchResultOpenTarget) => void
  onSelectResult: (id: SearchResultId | null) => void
  onToggleGroup: (path: string) => void
  rows: readonly SearchResultVirtualRow[]
}) {
  if (event.key === "ArrowDown") {
    event.preventDefault()
    onSelectResult(
      searchResultVirtualRowIdByOffset({ activeResultId, offset: 1, rows })
    )
    return
  }
  if (event.key === "ArrowUp") {
    event.preventDefault()
    onSelectResult(
      searchResultVirtualRowIdByOffset({ activeResultId, offset: -1, rows })
    )
    return
  }
  if (event.key === "Home") {
    event.preventDefault()
    onSelectResult(firstSearchResultVirtualRowId(rows))
    return
  }
  if (event.key === "End") {
    event.preventDefault()
    onSelectResult(lastSearchResultVirtualRowId(rows))
    return
  }
  if (event.key === "ArrowRight") {
    event.preventDefault()
    moveIntoSearchResultFile(
      rows,
      activeResultId,
      onSelectResult,
      onToggleGroup
    )
    return
  }
  if (event.key === "ArrowLeft") {
    event.preventDefault()
    moveOutOfSearchResultFile(
      rows,
      activeResultId,
      onSelectResult,
      onToggleGroup
    )
    return
  }
  if (event.key !== "Enter") return

  event.preventDefault()
  const target = searchResultOpenTargetForId(blocks, activeResultId)
  if (target) onOpenTarget(target)
}

function moveIntoSearchResultFile(
  rows: readonly SearchResultVirtualRow[],
  activeResultId: SearchResultId | null,
  onSelectResult: (id: SearchResultId | null) => void,
  onToggleGroup: (path: string) => void
) {
  const active = searchResultVirtualRowById(rows, activeResultId)
  if (active?.type !== "file") return

  if (active.file.collapsed) {
    onToggleGroup(active.file.path)
    return
  }

  onSelectResult(
    firstSearchResultExcerptId(rows, active.file.id) ?? active.file.id
  )
}

function moveOutOfSearchResultFile(
  rows: readonly SearchResultVirtualRow[],
  activeResultId: SearchResultId | null,
  onSelectResult: (id: SearchResultId | null) => void,
  onToggleGroup: (path: string) => void
) {
  const parentId = parentSearchResultFileId(rows, activeResultId)
  if (parentId) {
    onSelectResult(parentId)
    return
  }

  const active = searchResultVirtualRowById(rows, activeResultId)
  if (active?.type !== "file") return
  if (active.file.collapsed) return
  if (active.file.excerpts.length === 0) return

  onToggleGroup(active.file.path)
}

type SearchResultEditorVirtualizer = {
  readonly items: SearchResultVirtualListMetrics["items"]
  readonly totalSize: number
  readonly onScroll: (event: UIEvent<HTMLDivElement>) => void
  readonly scrollToIndex: SearchResultEditorScrollToIndex
  readonly scrollToOffset: (offset: number) => void
}

type SearchResultRenderedVirtualItem = {
  readonly renderKey: string
  readonly row: SearchResultVirtualRow
  readonly virtualItem: SearchResultVirtualListMetrics["items"][number]
}

type SearchResultRenderedFileResultItem = SearchResultRenderedVirtualItem & {
  readonly row: Extract<SearchResultVirtualRow, { type: "file-results" }>
}

type SearchResultFileEditorPoolEntry = {
  readonly item: SearchResultRenderedFileResultItem
  readonly key: SearchResultId
  readonly visible: boolean
}

type SearchResultFileEditorPoolState = {
  readonly items: ReadonlyMap<
    SearchResultId,
    SearchResultRenderedFileResultItem
  >
  readonly keys: readonly SearchResultId[]
}

type SearchResultEditorScrollToIndex = (
  index: number,
  target?: SearchResultVirtualRowScrollTarget | null
) => void

type SearchResultVirtualRowScrollTarget = {
  readonly offset: number
  readonly size: number
}

function scrollActiveSearchResultIntoView({
  activeIndexRef,
  activeScrollTargetRef,
  scrollToIndexRef,
}: {
  activeIndexRef: RefObject<number>
  activeScrollTargetRef: RefObject<SearchResultVirtualRowScrollTarget | null>
  scrollToIndexRef: RefObject<SearchResultEditorScrollToIndex>
}) {
  const currentActiveIndex = activeIndexRef.current
  if (currentActiveIndex < 0) return

  scrollToIndexRef.current(currentActiveIndex, activeScrollTargetRef.current)
}

function useSearchResultEditorVirtualizer(
  rows: readonly SearchResultVirtualRow[],
  parentRef: RefObject<HTMLDivElement | null>
): SearchResultEditorVirtualizer {
  const viewportRef = useRef<SearchResultVirtualListViewport>(
    INITIAL_SEARCH_RESULT_VIRTUAL_VIEWPORT
  )
  const [viewport, setViewport] = useState<SearchResultVirtualListViewport>(
    INITIAL_SEARCH_RESULT_VIRTUAL_VIEWPORT
  )
  const itemInputs = useMemo(() => searchResultVirtualRowInputs(rows), [rows])
  const metrics = useMemo(
    () => createSearchResultVirtualListMetrics(itemInputs),
    [itemInputs]
  )
  const items = useMemo(
    () =>
      visibleSearchResultVirtualListItems(metrics, viewport, {
        fallbackCount: SEARCH_RESULT_VIRTUAL_FALLBACK_COUNT,
        overscan: searchResultVirtualOverscan(viewport.height),
      }),
    [metrics, viewport]
  )
  const viewportHeight = viewport.height
  const updateViewport = useCallback(
    (next: SearchResultVirtualListViewport) => {
      viewportRef.current = next
      setViewport((current) =>
        equalSearchResultVirtualViewport(current, next) ? current : next
      )
    },
    []
  )
  const updateViewportHeight = useCallback(
    (height: number) => {
      updateViewport({
        height,
        top: viewportRef.current.top,
      })
    },
    [updateViewport]
  )
  const updateViewportTop = useCallback(
    (top: number) => {
      updateViewport({
        height: viewportRef.current.height,
        top,
      })
    },
    [updateViewport]
  )

  useEffect(() => {
    const element = parentRef.current
    if (!element) return

    updateViewportTop(element.scrollTop)
  }, [metrics.totalSize, parentRef, updateViewportTop])

  useEffect(() => {
    const element = parentRef.current
    if (!element) return
    if (typeof ResizeObserver === "undefined") return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return

      updateViewportHeight(searchResultVirtualViewportHeight(entry))
    })
    observer.observe(element)

    return () => observer.disconnect()
  }, [parentRef, updateViewportHeight])

  const scrollToOffset = useCallback(
    (offset: number) => {
      const element = parentRef.current
      if (!element) return

      const top = clampSearchResultVirtualListScrollTop(
        offset,
        metrics.totalSize + SEARCH_RESULT_VIRTUAL_PADDING,
        viewportRef.current.height
      )
      element.scrollTop = top
      updateViewportTop(top)
    },
    [metrics.totalSize, parentRef, updateViewportTop]
  )
  const scrollToIndex = useCallback(
    (index: number, target?: SearchResultVirtualRowScrollTarget | null) => {
      const element = parentRef.current
      if (!element) return
      if (viewportHeight <= 0) return

      const nextTop = scrollTopForSearchResultVirtualListItem(
        metrics,
        index,
        viewportRef.current,
        {
          itemOffset: SEARCH_RESULT_VIRTUAL_ROW_OFFSET,
          targetOffset: target?.offset,
          targetSize: target?.size,
          totalPadding: SEARCH_RESULT_VIRTUAL_PADDING,
        }
      )
      if (nextTop === null) return

      element.scrollTop = nextTop
      updateViewportTop(nextTop)
    },
    [metrics, parentRef, updateViewportTop, viewportHeight]
  )
  const onScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) =>
      updateViewportTop(event.currentTarget.scrollTop),
    [updateViewportTop]
  )

  return {
    items,
    onScroll,
    scrollToIndex,
    scrollToOffset,
    totalSize: metrics.totalSize,
  }
}

function resetSearchResultScroll(
  ref: RefObject<HTMLDivElement | null>,
  scrollToOffset: (offset: number) => void
) {
  if (ref.current) ref.current.scrollTop = 0

  scrollToOffset(0)
}

function searchResultFileRangeDecorations(
  document: SearchResultFileDocument,
  activeResultId: SearchResultId | null
) {
  const decorations: EditorRangeDecoration[] = []
  for (const line of document.lines) {
    if (line.pending) decorations.push(searchResultPendingDecoration(line))

    const active = line.id === activeResultId
    for (const range of line.matchRanges) {
      decorations.push(searchResultRangeDecoration(range, active))
    }
  }

  return decorations
}

function searchResultPendingDecoration(
  line: SearchResultFileDocumentLine
): EditorRangeDecoration {
  return {
    className: "search-result-match-pending",
    end: line.end,
    start: line.start,
    style: PENDING_MATCH_STYLE,
  }
}

function searchResultRangeDecoration(
  range: SearchResultRange,
  active: boolean
): EditorRangeDecoration {
  const className = active
    ? "search-result-match-active"
    : "search-result-match"
  const style = active ? ACTIVE_MATCH_STYLE : PASSIVE_MATCH_STYLE

  return {
    className,
    end: range.end,
    start: range.start,
    style,
  }
}

function fileBlockLineDigits(block: SearchResultFileBlock) {
  let digits = 1
  for (const excerpt of block.excerpts) {
    digits = Math.max(digits, decimalDigitCount(excerpt.startLine))
  }

  return digits
}

function groupMap(groups: readonly WorkspaceSearchFileGroup[]) {
  const map = new Map<string, WorkspaceSearchFileGroup>()
  for (const group of groups) {
    map.set(group.path, group)
  }

  return map
}

function searchResultVirtualRowIndex(
  rows: readonly SearchResultVirtualRow[],
  id: SearchResultId | null
) {
  if (!id) return -1

  return rows.findIndex((row) => searchResultVirtualRowContainsId(row, id))
}

function searchResultVirtualRowScrollTarget(
  row: SearchResultVirtualRow | null,
  activeResultId: SearchResultId | null
): SearchResultVirtualRowScrollTarget | null {
  if (!row) return null
  if (row.type === "file") {
    return {
      offset: 0,
      size: FILE_ROW_ESTIMATE,
    }
  }
  if (!activeResultId) return null

  const index = row.file.excerpts.findIndex(
    (excerpt) => excerpt.id === activeResultId
  )
  if (index < 0) return null

  return {
    offset: searchResultFileExcerptOffset(index),
    size: EXCERPT_EDITOR_LINE_HEIGHT,
  }
}

function searchResultFileExcerptOffset(index: number) {
  const rowStep = EXCERPT_EDITOR_LINE_HEIGHT + SEARCH_RESULT_FILE_EDITOR_ROW_GAP

  return FILE_RESULTS_ROW_VERTICAL_PADDING / 2 + index * rowStep
}

function searchResultVirtualRowEstimate(
  row: SearchResultVirtualRow | undefined
) {
  if (row?.type === "file") return FILE_ROW_ESTIMATE
  if (row?.type === "file-results")
    return searchResultFileEditorRowHeight(row.file)

  return FILE_RESULTS_EDITOR_MIN_HEIGHT
}

function searchResultVirtualRowKey(
  row: SearchResultVirtualRow | undefined,
  index: number
) {
  if (!row) return `missing:${index}`

  return searchResultVirtualRowId(row)
}

function searchResultRenderedVirtualItems(
  virtualItems: SearchResultVirtualListMetrics["items"],
  rows: readonly SearchResultVirtualRow[]
): SearchResultRenderedVirtualItem[] {
  const renderedItems: SearchResultRenderedVirtualItem[] = []

  for (const virtualItem of virtualItems) {
    const row = rows[virtualItem.index]
    if (!row) continue

    renderedItems.push({
      renderKey: virtualItem.key,
      row,
      virtualItem,
    })
  }

  return renderedItems
}

function useSearchResultFileEditorPoolEntries(
  visibleItems: readonly SearchResultRenderedFileResultItem[],
  prewarmEditorPool: boolean
) {
  const [poolState, setPoolState] = useState<SearchResultFileEditorPoolState>({
    items: new Map(),
    keys: [],
  })
  const visibleKeys = useMemo(
    () => visibleItems.map(searchResultFileEditorPoolItemKey),
    [visibleItems]
  )
  const poolKeys = useMemo(
    () =>
      nextSearchResultFileEditorPoolKeys(
        poolState.keys,
        visibleKeys,
        prewarmEditorPool
      ),
    [poolState.keys, prewarmEditorPool, visibleKeys]
  )

  useLayoutEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return

      setPoolState((current) => {
        const next = nextSearchResultFileEditorPoolKeys(
          current.keys,
          visibleKeys,
          prewarmEditorPool
        )
        const items = new Map(current.items)
        const itemsChanged = syncSearchResultFileEditorPoolCache(
          items,
          next,
          visibleItems
        )
        if (
          !itemsChanged &&
          searchResultFileEditorPoolKeysEqual(current.keys, next)
        )
          return current

        return { items, keys: next }
      })
    })

    return () => {
      cancelled = true
    }
  }, [prewarmEditorPool, visibleItems, visibleKeys])

  return useMemo(
    () =>
      searchResultFileEditorPoolEntries(
        poolKeys,
        visibleItems,
        poolState.items
      ),
    [poolKeys, poolState.items, visibleItems]
  )
}

function searchResultFileEditorPoolEntries(
  poolKeys: readonly SearchResultId[],
  visibleItems: readonly SearchResultRenderedFileResultItem[],
  cachedItems: ReadonlyMap<SearchResultId, SearchResultRenderedFileResultItem>
): SearchResultFileEditorPoolEntry[] {
  const visibleByKey = new Map<
    SearchResultId,
    SearchResultRenderedFileResultItem
  >()
  for (const item of visibleItems) {
    visibleByKey.set(searchResultFileEditorPoolItemKey(item), item)
  }

  const entries: SearchResultFileEditorPoolEntry[] = []
  for (const key of poolKeys) {
    const visibleItem = visibleByKey.get(key)
    const item = visibleItem ?? cachedItems.get(key)
    if (!item) continue

    entries.push({
      item,
      key,
      visible: visibleItem !== undefined,
    })
  }

  return entries
}

function searchResultFileEditorPoolItemKey(
  item: SearchResultRenderedFileResultItem
) {
  return item.row.file.id
}

function syncSearchResultFileEditorPoolCache(
  cache: Map<SearchResultId, SearchResultRenderedFileResultItem>,
  poolKeys: readonly SearchResultId[],
  visibleItems: readonly SearchResultRenderedFileResultItem[]
) {
  let changed = false
  for (const item of visibleItems) {
    const key = searchResultFileEditorPoolItemKey(item)
    if (cache.get(key) === item) continue

    changed = true
    cache.set(key, item)
  }

  const poolKeySet = new Set(poolKeys)
  for (const key of cache.keys()) {
    if (poolKeySet.has(key)) continue

    changed = true
    cache.delete(key)
  }

  return changed
}

function isSearchResultRenderedFileResultItem(
  item: SearchResultRenderedVirtualItem
): item is SearchResultRenderedFileResultItem {
  return item.row.type === "file-results"
}

function searchResultVirtualRowStyle(
  virtualItem: SearchResultVirtualListMetrics["items"][number]
): CSSProperties {
  return {
    contain: "layout paint style",
    transform: `translateY(${virtualItem.start + SEARCH_RESULT_VIRTUAL_ROW_OFFSET}px)`,
  }
}

function searchResultVirtualRowInputs(rows: readonly SearchResultVirtualRow[]) {
  return rows.map((row, index) => ({
    key: searchResultVirtualRowKey(row, index),
    size: searchResultVirtualRowEstimate(row),
  }))
}

function searchResultVirtualOverscan(viewportHeight: number) {
  return Math.max(
    SEARCH_RESULT_VIRTUAL_MIN_OVERSCAN,
    Math.floor(viewportHeight * 0.5)
  )
}

function equalSearchResultVirtualViewport(
  current: SearchResultVirtualListViewport,
  next: SearchResultVirtualListViewport
) {
  return current.height === next.height && current.top === next.top
}

function searchResultVirtualViewportHeight(entry: ResizeObserverEntry) {
  return Math.max(0, Math.floor(entry.contentRect.height))
}

function searchResultVirtualRowExpanded(row: SearchResultVirtualRow) {
  if (row.type !== "file") return undefined
  if (row.file.excerpts.length === 0) return undefined

  return !row.file.collapsed
}

function scheduleSearchResultSyntaxEnable(callback: () => void) {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(callback, { timeout: 800 })
    return () => window.cancelIdleCallback(id)
  }

  const id = globalThis.setTimeout(callback, 120)
  return () => globalThis.clearTimeout(id)
}

function openFileResultOnEnter(
  event: KeyboardEvent<HTMLDivElement>,
  onOpen: () => void
) {
  if (event.key !== "Enter") return false
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
    return false

  event.preventDefault()
  event.stopPropagation()
  onOpen()
  return true
}

function readonlyEditingKey(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key === "Backspace") return true
  if (event.key === "Delete") return true
  if (event.key === "Tab") return true
  if (event.key !== "Enter") return false

  return event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
}

function preventReadonlyInput(event: {
  preventDefault(): void
  stopPropagation(): void
}) {
  event.preventDefault()
  event.stopPropagation()
}

function isSearchResultEditorActionTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false

  return target.closest("button") !== null
}

function currentSearchResultFileLine(
  document: SearchResultFileDocument,
  controller: { getState(): { cursor: { row: number } } | null }
) {
  const row = controller.getState()?.cursor.row

  return (
    searchResultFileDocumentLineAtRow(document, row) ??
    document.lines[0] ??
    null
  )
}

function searchResultFileDocumentLineSelection(
  line: SearchResultFileDocumentLine
) {
  const range = line.matchRanges[0]
  if (range) return range

  return {
    end: line.end,
    start: line.start,
  }
}

function searchResultFileDocumentId(file: SearchResultFileBlock) {
  return `search-result-file:${file.path}`
}

function searchResultDomId(treeId: string, itemId: string) {
  return `${treeId}-${itemId}`
}

function matchCountLabel(count: number) {
  if (count === 1) return "1 match"

  return `${count} matches`
}

function fileName(path: string) {
  return path.split("/").at(-1) || path
}

function fileIconStyle(icon: ResolvedFileIcon): CSSProperties {
  const mask = `url(${icon.src}) center / contain no-repeat`

  return {
    backgroundColor: colorForFileIcon(icon),
    mask,
    WebkitMask: mask,
  }
}

function decimalDigitCount(value: number) {
  return String(Math.max(1, Math.floor(value))).length
}

function searchResultFileEditorStyle(
  document: SearchResultFileDocument
): CSSProperties {
  return {
    height: searchResultFileEditorHeight(document.lines.length),
  }
}

function searchResultSourceLineGutterStyle(
  lineCount: number,
  minDigits: number
): CSSProperties {
  return {
    gap: SEARCH_RESULT_FILE_EDITOR_ROW_GAP,
    gridTemplateRows: `repeat(${lineCount}, ${EXCERPT_EDITOR_LINE_HEIGHT}px)`,
    height: searchResultFileEditorHeight(lineCount),
    minWidth: 26,
    width: `calc(${Math.max(3, minDigits)}ch + 8px)`,
  }
}

function searchResultFileEditorRowHeight(file: SearchResultFileBlock) {
  return (
    searchResultFileEditorHeight(file.excerpts.length) +
    FILE_RESULTS_ROW_VERTICAL_PADDING
  )
}

function searchResultFileEditorHeight(lineCount: number) {
  const rowGaps = Math.max(0, lineCount - 1) * SEARCH_RESULT_FILE_EDITOR_ROW_GAP

  return Math.max(
    FILE_RESULTS_EDITOR_MIN_HEIGHT,
    lineCount * EXCERPT_EDITOR_LINE_HEIGHT + rowGaps
  )
}
