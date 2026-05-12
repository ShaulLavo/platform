import "@editor/core/style.css"
import "@editor/find/style.css"
import "@editor/gutters/style.css"

import { CaretRightIcon, FileTextIcon } from "@phosphor-icons/react"
import type {
  EditorKeymapLayer,
  EditorRangeDecoration,
  EditorSyntaxLanguageId,
} from "@editor/core"
import { createEditorFindPlugin } from "@editor/find"
import { createLineGutterPlugin } from "@editor/gutters"
import { EditorHost, useEditor } from "@editor/react"
import { useVirtualizer } from "@tanstack/react-virtual"
import type { WorkspaceSearchMatch } from "@workspace/contracts"
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
} from "react"

import { useWorkspaceFocus } from "@/components/workspace/workspace-focus-state"
import { useEditorShikiTheme } from "@/features/editor/hooks/use-editor-shiki-theme"
import type {
  SearchBufferSnapshot,
  WorkspaceSearchFileGroup,
} from "@/features/search/search-buffer-state"
import {
  firstSearchResultExcerptId,
  firstSearchResultVirtualRowId,
  lastSearchResultVirtualRowId,
  parentSearchResultFileId,
  searchResultFileBlocks,
  searchResultOpenTargetForId,
  searchResultVirtualRowById,
  searchResultVirtualRowId,
  searchResultVirtualRowIdByOffset,
  searchResultVirtualRows,
  type SearchResultExcerpt,
  type SearchResultFileBlock,
  type SearchResultOpenTarget,
  type SearchResultRange,
  type SearchResultVirtualRow,
} from "@/features/search/search-result-view-model"
import type { SearchResultId } from "@/features/search/search-result-items"
import { readonlyEditorKeymapLayers } from "@/keymap"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

const FILE_ROW_ESTIMATE = 44
const EXCERPT_ROW_ESTIMATE = 32
const EXCERPT_EDITOR_LINE_HEIGHT = 22
const EXCERPT_EDITOR_HEIGHT = 28

const PASSIVE_MATCH_STYLE = {
  backgroundColor: "rgba(250, 204, 21, 0.38)",
}

const ACTIVE_MATCH_STYLE = {
  backgroundColor: "rgba(250, 204, 21, 0.68)",
}

type SearchResultEditorSurfaceProps = {
  activeResultId: SearchResultId | null
  canReplace?: boolean
  groups: readonly WorkspaceSearchFileGroup[]
  keymapLayers: readonly EditorKeymapLayer[]
  replaceVisible: boolean
  resultsQuery: string
  snapshot: SearchBufferSnapshot
  onOpenTarget: (target: SearchResultOpenTarget) => void
  onReplaceGroup?: (group: WorkspaceSearchFileGroup) => void
  onReplaceMatch?: (match: WorkspaceSearchMatch) => void
  onSelectResult: (id: SearchResultId | null) => void
  onToggleGroup: (path: string) => void
}

export function SearchResultEditorSurface({
  activeResultId,
  canReplace,
  groups,
  keymapLayers,
  replaceVisible,
  resultsQuery,
  snapshot,
  onOpenTarget,
  onReplaceGroup,
  onReplaceMatch,
  onSelectResult,
  onToggleGroup,
}: SearchResultEditorSurfaceProps) {
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
    () => searchResultFileBlocks(groups, resultsQuery),
    [groups, resultsQuery]
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
  const minLineDigits = useMemo(() => minLineDigitsByExcerpt(blocks), [blocks])
  const displayedResultsQuery = snapshot.resultsSearchQuery?.query ?? null
  const previousDisplayedResultsQueryRef = useRef<string | null>(null)
  const activeIndexRef = useRef(activeIndex)

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual is the search result buffer virtualization layer.
  const virtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: (index) => searchResultVirtualRowEstimate(rows[index]),
    getScrollElement: () => parentRef.current,
    getItemKey: (index) => searchResultVirtualRowKey(rows[index], index),
    measureElement,
    overscan: 10,
  })

  useLayoutEffect(() => {
    activeIndexRef.current = activeIndex
  }, [activeIndex])

  useLayoutEffect(() => {
    if (!activeResultId) return

    const currentActiveIndex = activeIndexRef.current
    if (currentActiveIndex < 0) return

    virtualizer.scrollToIndex(currentActiveIndex, { align: "auto" })
  }, [activeResultId, virtualizer])

  useLayoutEffect(() => {
    if (displayedResultsQuery === null) return
    if (previousDisplayedResultsQueryRef.current === displayedResultsQuery)
      return

    previousDisplayedResultsQueryRef.current = displayedResultsQuery
    resetSearchResultScroll(parentRef, virtualizer)
    const frame = window.requestAnimationFrame(() =>
      resetSearchResultScroll(parentRef, virtualizer)
    )

    return () => window.cancelAnimationFrame(frame)
  }, [displayedResultsQuery, virtualizer])

  useEffect(() => {
    if (activeRow?.type === "excerpt") return

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
    >
      <div
        className="relative"
        style={{ height: virtualizer.getTotalSize() + 12 }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const row = rows[virtualItem.index]
          if (!row) return null

          const id = searchResultVirtualRowId(row)
          const active = id === activeResultId

          return (
            <div
              aria-expanded={searchResultVirtualRowExpanded(row)}
              aria-level={row.type === "file" ? 1 : 2}
              aria-selected={active}
              className="absolute right-2 left-2"
              data-index={virtualItem.index}
              id={searchResultDomId(treeId, id)}
              key={virtualItem.key}
              ref={virtualizer.measureElement}
              role="treeitem"
              style={{
                transform: `translateY(${virtualItem.start + 6}px)`,
              }}
              onMouseDown={() => onSelectResult(id)}
            >
              {row.type === "file" ? (
                <SearchResultFileHeader
                  active={active}
                  canReplace={canReplace}
                  file={row.file}
                  replaceVisible={replaceVisible}
                  onOpen={() =>
                    onOpenTarget({ match: null, path: row.file.path })
                  }
                  onReplace={() => handleReplaceFile(row.file.path)}
                  onToggle={() => onToggleGroup(row.file.path)}
                />
              ) : (
                <SearchResultExcerptEditor
                  active={active}
                  excerpt={row.excerpt}
                  keymapLayers={readonlyKeymapLayers}
                  minLineDigits={minLineDigits.get(row.excerpt.id) ?? 1}
                  replaceVisible={replaceVisible}
                  canReplace={canReplace}
                  onOpen={() =>
                    onOpenTarget({
                      match: row.excerpt.sourceMatch,
                      path: row.excerpt.path,
                    })
                  }
                  onReplace={() => onReplaceMatch?.(row.excerpt.sourceMatch)}
                  onSelect={() => onSelectResult(row.excerpt.id)}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SearchResultFileHeader({
  active,
  canReplace,
  file,
  replaceVisible,
  onOpen,
  onReplace,
  onToggle,
}: {
  active: boolean
  canReplace?: boolean
  file: SearchResultFileBlock
  replaceVisible: boolean
  onOpen: () => void
  onReplace: () => void
  onToggle: () => void
}) {
  return (
    <div
      className={cn(
        "grid w-full grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-1.5 border-l border-transparent px-2 py-1.5 text-left",
        active && "border-l-yellow-500/70 bg-muted/65",
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
      <button
        className="grid min-w-0 grid-cols-[16px_minmax(0,1fr)] items-center gap-1.5 text-left outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50"
        tabIndex={-1}
        title={file.path}
        type="button"
        onClick={onOpen}
      >
        <FileTextIcon className="size-3.5 text-muted-foreground" />
        <span className="min-w-0">
          <span className="block truncate text-xs font-medium">
            {fileName(file.path)}
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {file.pathLabel}
          </span>
        </span>
      </button>
      <span className="rounded bg-muted/50 px-1.5 text-[10px] leading-4 text-muted-foreground">
        {matchCountLabel(file.matchCount)}
      </span>
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

function SearchResultExcerptEditor({
  active,
  canReplace,
  excerpt,
  keymapLayers,
  minLineDigits,
  replaceVisible,
  onOpen,
  onReplace,
  onSelect,
}: {
  active: boolean
  canReplace?: boolean
  excerpt: SearchResultExcerpt
  keymapLayers: readonly EditorKeymapLayer[]
  minLineDigits: number
  replaceVisible: boolean
  onOpen: () => void
  onReplace: () => void
  onSelect: () => void
}) {
  const setFocusArea = useWorkspaceFocus((state) => state.setFocusArea)
  const setActiveEditorCommandDispatch = useWorkspaceFocus(
    (state) => state.setActiveEditorCommandDispatch
  )
  const { editorThemeRefresh } = useEditorShikiTheme()
  const document = useMemo(
    () => ({
      documentId: `search-result-excerpt:${excerpt.id}`,
      documentMode: "static" as const,
      languageId: excerpt.languageId,
      revision: searchResultExcerptRevision(excerpt),
      text: excerpt.text,
    }),
    [excerpt]
  )
  const rangeDecorations = useMemo(
    () => searchResultRangeDecorations(excerpt.matchRanges, active),
    [active, excerpt.matchRanges]
  )
  const plugins = useMemo(
    () => [
      createLineGutterPlugin({
        minDigits: minLineDigits,
        startLine: excerpt.startLine,
      }),
      createEditorFindPlugin(),
    ],
    [excerpt.startLine, minLineDigits]
  )
  const controller = useEditor({
    cursorLineHighlight: {
      gutterBackground: ["line-gutter"],
      gutterNumber: true,
      rowBackground: true,
    },
    document,
    editability: "readonly",
    keymap: {
      defaultBindings: false,
      layers: keymapLayers,
    },
    lineHeight: EXCERPT_EDITOR_LINE_HEIGHT,
    plugins,
    rangeDecorations,
    theme: editorThemeRefresh,
  })

  useEffect(() => {
    if (!active) return

    setActiveEditorCommandDispatch(controller.commands.dispatchCommand)
    return () => setActiveEditorCommandDispatch(null)
  }, [active, controller, setActiveEditorCommandDispatch])

  useEffect(() => {
    if (!active) return

    const range = excerpt.matchRanges[0]
    if (!range) return

    controller.commands.setSelection(range.start, range.end, range.start)
  }, [active, controller, excerpt.matchRanges])

  function handleActivate() {
    onSelect()
    setFocusArea("editor")
  }

  function handleKeyDownCapture(event: KeyboardEvent<HTMLDivElement>) {
    if (openExcerptOnEnter(event, onOpen)) return
    if (!readonlyEditingKey(event)) return

    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <div
      className={cn(
        "ml-5 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5 border-l px-2 py-0.5",
        active && "border-l-yellow-500/70 bg-muted/55",
        !active && "hover:bg-muted/35"
      )}
      onBeforeInputCapture={preventReadonlyInput}
      onDropCapture={preventReadonlyInput}
      onFocusCapture={handleActivate}
      onKeyDownCapture={handleKeyDownCapture}
      onPasteCapture={preventReadonlyInput}
      onPointerDownCapture={handleActivate}
      onClick={onOpen}
    >
      <EditorHost
        className="app-editor-host search-result-excerpt-editor-host"
        controller={controller}
        style={searchResultExcerptEditorStyle}
      />
      {replaceVisible ? (
        <Button
          className="h-6 px-1.5 text-[10px]"
          disabled={!canReplace}
          size="xs"
          title="Replace this match"
          type="button"
          variant="ghost"
          onClick={(event) => {
            event.stopPropagation()
            onReplace()
          }}
        >
          Replace
        </Button>
      ) : null}
    </div>
  )
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

function resetSearchResultScroll(
  ref: RefObject<HTMLDivElement | null>,
  virtualizer: ReturnType<typeof useVirtualizer<HTMLDivElement, Element>>
) {
  if (ref.current) ref.current.scrollTop = 0

  virtualizer.scrollToOffset(0)
}

function searchResultRangeDecorations(
  ranges: readonly SearchResultRange[],
  active: boolean
): readonly EditorRangeDecoration[] {
  const className = active
    ? "search-result-match-active"
    : "search-result-match"
  const style = active ? ACTIVE_MATCH_STYLE : PASSIVE_MATCH_STYLE

  return ranges.map((range) => ({
    className,
    end: range.end,
    start: range.start,
    style,
  }))
}

function minLineDigitsByExcerpt(blocks: readonly SearchResultFileBlock[]) {
  const digits = new Map<SearchResultId, number>()
  for (const block of blocks) {
    const minDigits = fileBlockLineDigits(block)
    for (const excerpt of block.excerpts) {
      digits.set(excerpt.id, minDigits)
    }
  }

  return digits
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

  return rows.findIndex((row) => searchResultVirtualRowId(row) === id)
}

function searchResultVirtualRowEstimate(
  row: SearchResultVirtualRow | undefined
) {
  if (row?.type === "file") return FILE_ROW_ESTIMATE

  return EXCERPT_ROW_ESTIMATE
}

function searchResultVirtualRowKey(
  row: SearchResultVirtualRow | undefined,
  index: number
) {
  if (!row) return index

  return searchResultVirtualRowId(row)
}

function searchResultVirtualRowExpanded(row: SearchResultVirtualRow) {
  if (row.type !== "file") return undefined
  if (row.file.excerpts.length === 0) return undefined

  return !row.file.collapsed
}

function measureElement(element: Element) {
  return element.getBoundingClientRect().height
}

function openExcerptOnEnter(
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

function searchResultExcerptRevision(excerpt: SearchResultExcerpt) {
  return `${excerpt.text.length}:${stableHash(excerpt.text)}:${languageKey(
    excerpt.languageId
  )}`
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

function decimalDigitCount(value: number) {
  return String(Math.max(1, Math.floor(value))).length
}

function languageKey(languageId: EditorSyntaxLanguageId | null) {
  return languageId ?? "plain"
}

function stableHash(value: string) {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return (hash >>> 0).toString(36)
}

const searchResultExcerptEditorStyle = {
  height: EXCERPT_EDITOR_HEIGHT,
} satisfies CSSProperties
