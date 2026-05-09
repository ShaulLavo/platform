import {
  createPieceTableSnapshot,
  VirtualizedTextView,
  type EditorTheme,
  type EditorToken,
  type VirtualizedTextHighlightRange,
  type VirtualizedTextRowDecoration,
} from "@editor/core"
import {
  canUseShikiWorker,
  createShikiHighlighterSession,
  loadShikiTheme,
} from "@editor/core/shiki"
import { ResizablePaneGroup, type ResizablePaneLayout } from "@editor/panes"
import { createDiffGutterContribution } from "./gutters"
import { joinRenderLines, languageIdForPath } from "./lines"
import { createSplitProjection, createStackedProjection } from "./projection"
import type {
  DiffFile,
  DiffHunkLocation,
  DiffRenderRow,
  DiffSplitPaneLayout,
  DiffViewMode,
  DiffViewOptions,
} from "./types"

type MountedPane = {
  rows: readonly DiffRenderRow[]
  syntaxGeneration: number
  tokens?: readonly EditorToken[]
  readonly side: "old" | "new" | "stacked"
  readonly view: VirtualizedTextView
  readonly disposeEvents: () => void
  syntaxSession?: { dispose(): void }
}

const DEFAULT_THEME = "github-dark"
const WHEEL_LINE_DELTA = 40
let nextDiffViewId = 0

export class DiffView {
  private readonly root: HTMLDivElement
  private readonly fileList: HTMLDivElement
  private readonly content: HTMLDivElement
  private readonly highlightPrefix: string
  private readonly options: DiffViewOptions
  private files: readonly DiffFile[] = []
  private selectedPath: string | null = null
  private mode: DiffViewMode
  private panes: MountedPane[] = []
  private paneGroup: ResizablePaneGroup | null = null
  private hunkRows: ReadonlyMap<number, number> = new Map()
  private expandedHunksByPath = new Map<string, Set<number>>()
  private disposeScrollSync: (() => void) | null = null
  private syncingScroll = false

  constructor(container: HTMLElement, options: DiffViewOptions = {}) {
    this.options = options
    this.mode = options.mode ?? "split"
    this.highlightPrefix = `editor-diff-${nextDiffViewId++}`
    this.root = container.ownerDocument.createElement("div")
    this.fileList = container.ownerDocument.createElement("div")
    this.content = container.ownerDocument.createElement("div")
    this.root.className = "editor-diff-view"
    this.fileList.className = "editor-diff-file-list"
    this.content.className = "editor-diff-content"
    if (this.options.showFileList !== false) this.root.append(this.fileList)
    this.root.append(this.content)
    container.appendChild(this.root)
  }

  setFiles(files: readonly DiffFile[]): void {
    this.files = [...files]
    this.selectedPath = selectedPathForFiles(this.files, this.selectedPath)
    this.render()
  }

  setMode(mode: DiffViewMode): void {
    if (this.mode === mode) return

    this.mode = mode
    this.renderSelectedFile()
  }

  setSelectedFile(path: string): void {
    if (this.selectedPath === path) return
    if (!this.files.some((file) => file.path === path)) return

    this.selectedPath = path
    this.render()
  }

  revealNextHunk(options: { readonly wrap?: boolean } = {}): boolean {
    const locations = this.selectedHunkLocations()
    const position = this.currentHunkPosition(locations)
    const next = locations[position + 1] ?? null
    if (next) return this.revealHunk(next.index)
    if (!options.wrap) return false

    const first = locations[0] ?? null
    return first ? this.revealHunk(first.index) : false
  }

  revealPreviousHunk(options: { readonly wrap?: boolean } = {}): boolean {
    const locations = this.selectedHunkLocations()
    const position = this.currentHunkPosition(locations)
    const previous = locations[position - 1] ?? null
    if (previous) return this.revealHunk(previous.index)
    if (!options.wrap) return false

    const last = locations.at(-1) ?? null
    return last ? this.revealHunk(last.index) : false
  }

  revealHunk(index: number): boolean {
    const row = this.hunkRows.get(index)
    if (row === undefined) return false

    for (const pane of this.panes) pane.view.scrollToRow(row)
    return true
  }

  getCurrentHunk(): DiffHunkLocation | null {
    const locations = this.selectedHunkLocations()
    const position = this.currentHunkPosition(locations)
    return locations[position] ?? null
  }

  dispose(): void {
    this.disposePanes()
    this.root.remove()
  }

  private render(): void {
    this.renderFileList()
    this.renderSelectedFile()
  }

  private renderFileList(): void {
    if (this.options.showFileList === false) return

    this.fileList.textContent = ""
    for (const file of this.files)
      this.fileList.appendChild(this.createFileButton(file))
  }

  private createFileButton(file: DiffFile): HTMLButtonElement {
    const button = this.root.ownerDocument.createElement("button")
    button.type = "button"
    button.className = "editor-diff-file-button"
    button.textContent = file.path
    button.dataset.changeType = file.changeType
    button.setAttribute("aria-pressed", String(file.path === this.selectedPath))
    button.addEventListener("click", () => this.setSelectedFile(file.path))
    return button
  }

  private renderSelectedFile(): void {
    this.disposePanes()
    this.content.textContent = ""
    const file = this.selectedFile()
    if (!file) {
      this.renderEmptyState("No diff files")
      return
    }

    if (this.mode === "stacked") {
      this.renderStackedFile(file)
      return
    }

    this.renderSplitFile(file)
  }

  private renderSplitFile(file: DiffFile): void {
    const projection = createSplitProjection(file, {
      expandedHunks: this.expandedHunksForFile(file),
    })
    this.hunkRows = projection.hunkRows
    const split = this.root.ownerDocument.createElement("div")
    split.className = "editor-diff-split"
    this.content.appendChild(split)
    const left = this.createPane(split, "old", projection.leftRows, file)
    const right = this.createPane(split, "new", projection.rightRows, file)
    this.panes = [left, right]
    this.paneGroup = this.createSplitPaneGroup(split, left, right, file)
    this.disposeScrollSync = this.installScrollSync(left.view, right.view)
  }

  private createSplitPaneGroup(
    split: HTMLElement,
    left: MountedPane,
    right: MountedPane,
    file: DiffFile
  ): ResizablePaneGroup {
    const splitPane = this.options.splitPane
    return new ResizablePaneGroup(split, {
      id: `${this.highlightPrefix}-split`,
      panes: [
        {
          id: "old",
          element:
            left.view.scrollElement.parentElement ?? left.view.scrollElement,
          minSize: splitPane?.minSize?.old,
          maxSize: splitPane?.maxSize?.old,
        },
        {
          id: "new",
          element:
            right.view.scrollElement.parentElement ?? right.view.scrollElement,
          minSize: splitPane?.minSize?.new,
          maxSize: splitPane?.maxSize?.new,
        },
      ],
      defaultLayout: splitDefaultLayout(splitPane?.defaultLayout),
      createHandle: splitPane?.createHandle
        ? (context) =>
            splitPane.createHandle?.({ ...context, file }) ??
            context.document.createElement("div")
        : (context) => createDefaultSplitHandle(context.document),
      onLayoutChange: splitPane?.onLayoutChange
        ? (layout) => splitPane.onLayoutChange?.(diffSplitLayout(layout), file)
        : undefined,
      onLayoutChanged: splitPane?.onLayoutChanged
        ? (layout) => splitPane.onLayoutChanged?.(diffSplitLayout(layout), file)
        : undefined,
      disabled: splitPane?.disabled,
    })
  }

  private renderStackedFile(file: DiffFile): void {
    const projection = createStackedProjection(file, {
      expandedHunks: this.expandedHunksForFile(file),
    })
    this.hunkRows = projection.hunkRows
    const pane = this.createPane(this.content, "stacked", projection.rows, file)
    this.panes = [pane]
  }

  private createPane(
    parent: HTMLElement,
    side: "old" | "new" | "stacked",
    rows: readonly DiffRenderRow[],
    file: DiffFile
  ): MountedPane {
    const host = this.root.ownerDocument.createElement("div")
    host.className = `editor-diff-pane editor-diff-pane-${side}`
    parent.appendChild(host)
    let mountedPane: MountedPane | null = null
    const view = new VirtualizedTextView(host, {
      className: "editor-diff-text editor-virtualized",
      gutterContributions: [
        createDiffGutterContribution(side, () => mountedPane?.rows ?? rows),
      ],
      lineHeight: this.options.lineHeight,
      selectionHighlightName: `${this.highlightPrefix}-${side}-selection`,
      tabSize: this.options.tabSize,
    })
    view.setEditable(false)
    view.setText(joinRenderLines(rows))
    view.setRowDecorations(rowDecorations(rows))
    view.setRangeHighlight(
      this.inlineHighlightName(side),
      inlineHighlightRanges(rows),
      {
        backgroundColor: "rgba(255, 255, 255, 0.18)",
      }
    )
    const disposeEvents = this.installPaneInteractions(
      view,
      () => mountedPane?.rows ?? rows
    )
    mountedPane = { view, rows, side, disposeEvents, syntaxGeneration: 0 }
    this.refreshSyntaxHighlighting(mountedPane, file)
    return mountedPane
  }

  private installPaneInteractions(
    view: VirtualizedTextView,
    getRows: () => readonly DiffRenderRow[]
  ): () => void {
    const onClick = (event: MouseEvent) => this.handlePaneClick(event, getRows)
    view.scrollElement.addEventListener("click", onClick)
    return () => view.scrollElement.removeEventListener("click", onClick)
  }

  private handlePaneClick(
    event: MouseEvent,
    getRows: () => readonly DiffRenderRow[]
  ): void {
    const target = event.target
    if (!(target instanceof Element)) return

    const rowElement = target.closest<HTMLElement>("[data-editor-virtual-row]")
    if (!rowElement) return

    this.toggleRowHunk(getRows()[Number(rowElement.dataset.editorVirtualRow)])
  }

  private toggleRowHunk(row: DiffRenderRow | undefined): void {
    if (row?.type !== "hunk") return
    if (!row.expandable) return
    if (row.hunkIndex === undefined) return

    const file = this.selectedFile()
    if (!file) return

    toggleSetValue(this.mutableExpandedHunksForFile(file), row.hunkIndex)
    this.updateSelectedFilePanes(file)
  }

  private updateSelectedFilePanes(file: DiffFile): void {
    if (this.mode === "stacked") {
      this.updateStackedFile(file)
      return
    }

    this.updateSplitFile(file)
  }

  private updateSplitFile(file: DiffFile): void {
    const left = this.panes[0]
    const right = this.panes[1]
    if (!left || !right || left.side !== "old" || right.side !== "new") {
      this.renderSelectedFile()
      return
    }

    const projection = createSplitProjection(file, {
      expandedHunks: this.expandedHunksForFile(file),
    })
    this.hunkRows = projection.hunkRows
    this.updatePaneRows(left, projection.leftRows, file)
    this.updatePaneRows(right, projection.rightRows, file)
  }

  private updateStackedFile(file: DiffFile): void {
    const pane = this.panes[0]
    if (!pane || pane.side !== "stacked") {
      this.renderSelectedFile()
      return
    }

    const projection = createStackedProjection(file, {
      expandedHunks: this.expandedHunksForFile(file),
    })
    this.hunkRows = projection.hunkRows
    this.updatePaneRows(pane, projection.rows, file)
  }

  private updatePaneRows(
    pane: MountedPane,
    rows: readonly DiffRenderRow[],
    file: DiffFile
  ): void {
    pane.rows = rows
    pane.view.setText(joinRenderLines(rows))
    if (pane.tokens) pane.view.setTokens(pane.tokens)
    pane.view.setRowDecorations(rowDecorations(rows))
    pane.view.setRangeHighlight(
      this.inlineHighlightName(pane.side),
      inlineHighlightRanges(rows),
      {
        backgroundColor: "rgba(255, 255, 255, 0.18)",
      }
    )
    this.refreshSyntaxHighlighting(pane, file)
  }

  private installScrollSync(
    left: VirtualizedTextView,
    right: VirtualizedTextView
  ): () => void {
    const leftElement = left.scrollElement
    const rightElement = right.scrollElement
    let pendingFrame = 0
    let pendingSource: HTMLElement | null = null
    let pendingTarget: HTMLElement | null = null

    const onLeftWheel = (event: WheelEvent) =>
      this.syncWheelScroll(event, leftElement, rightElement)
    const onRightWheel = (event: WheelEvent) =>
      this.syncWheelScroll(event, rightElement, leftElement)
    const onLeftScroll = () => {
      if (this.syncingScroll) return

      pendingSource = leftElement
      pendingTarget = rightElement
      pendingFrame ||=
        this.root.ownerDocument.defaultView?.requestAnimationFrame(
          flushPendingScroll
        ) ?? 0
    }
    const onRightScroll = () => {
      if (this.syncingScroll) return

      pendingSource = rightElement
      pendingTarget = leftElement
      pendingFrame ||=
        this.root.ownerDocument.defaultView?.requestAnimationFrame(
          flushPendingScroll
        ) ?? 0
    }
    const flushPendingScroll = () => {
      pendingFrame = 0
      if (!pendingSource || !pendingTarget) return

      this.syncScrollElements(pendingSource, pendingTarget)
      pendingSource = null
      pendingTarget = null
    }

    leftElement.addEventListener("wheel", onLeftWheel, { passive: false })
    rightElement.addEventListener("wheel", onRightWheel, { passive: false })
    leftElement.addEventListener("scroll", onLeftScroll)
    rightElement.addEventListener("scroll", onRightScroll)

    return () => {
      const view = this.root.ownerDocument.defaultView
      if (pendingFrame) view?.cancelAnimationFrame(pendingFrame)
      leftElement.removeEventListener("wheel", onLeftWheel)
      rightElement.removeEventListener("wheel", onRightWheel)
      leftElement.removeEventListener("scroll", onLeftScroll)
      rightElement.removeEventListener("scroll", onRightScroll)
    }
  }

  private syncWheelScroll(
    event: WheelEvent,
    source: HTMLElement,
    target: HTMLElement
  ): void {
    if (!event.cancelable) return

    const delta = normalizedWheelDelta(event, source)
    if (!delta.top && !delta.left) return

    event.preventDefault()
    this.withScrollSync(() => {
      const beforeTop = source.scrollTop
      const beforeLeft = source.scrollLeft
      source.scrollTop += delta.top
      source.scrollLeft += delta.left
      target.scrollTop += source.scrollTop - beforeTop
      target.scrollLeft += source.scrollLeft - beforeLeft
    })
  }

  private syncScrollElements(source: HTMLElement, target: HTMLElement): void {
    this.withScrollSync(() => {
      target.scrollTop = source.scrollTop
      target.scrollLeft = source.scrollLeft
    })
  }

  private withScrollSync(sync: () => void): void {
    this.syncingScroll = true
    sync()
    const view = this.root.ownerDocument.defaultView
    if (!view) {
      this.syncingScroll = false
      return
    }

    view.requestAnimationFrame(() => (this.syncingScroll = false))
  }

  private renderEmptyState(text: string): void {
    const empty = this.root.ownerDocument.createElement("div")
    empty.className = "editor-diff-empty"
    empty.textContent = text
    this.content.appendChild(empty)
    this.hunkRows = new Map()
  }

  private selectedFile(): DiffFile | null {
    return (
      this.files.find((file) => file.path === this.selectedPath) ??
      this.files[0] ??
      null
    )
  }

  private selectedHunkLocations(): readonly DiffHunkLocation[] {
    const file = this.selectedFile()
    if (!file) return []

    const locations = [...this.hunkRows].flatMap(([index, row]) => {
      const hunk = file.hunks[index]
      if (!hunk) return []

      return [{ hunk, index, path: file.path, row }]
    })

    return locations.sort((left, right) => left.row - right.row)
  }

  private currentHunkPosition(locations: readonly DiffHunkLocation[]): number {
    const topRow = this.currentTopRow()
    let current = -1

    for (const [position, location] of locations.entries()) {
      if (location.row > topRow) break

      current = position
    }

    return current
  }

  private currentTopRow(): number {
    return this.panes[0]?.view.getState().visibleRange.start ?? 0
  }

  private disposePanes(): void {
    this.paneGroup?.dispose()
    this.paneGroup = null
    this.disposeScrollSync?.()
    this.disposeScrollSync = null
    for (const pane of this.panes) {
      pane.disposeEvents()
      pane.syntaxSession?.dispose()
      pane.view.dispose()
    }
    this.panes = []
  }

  private expandedHunksForFile(file: DiffFile): ReadonlySet<number> {
    return this.expandedHunksByPath.get(file.path) ?? new Set()
  }

  private mutableExpandedHunksForFile(file: DiffFile): Set<number> {
    const existing = this.expandedHunksByPath.get(file.path)
    if (existing) return existing

    const next = new Set<number>()
    this.expandedHunksByPath.set(file.path, next)
    return next
  }

  private refreshSyntaxHighlighting(pane: MountedPane, file: DiffFile): void {
    pane.syntaxSession?.dispose()
    pane.syntaxSession = undefined
    pane.syntaxGeneration += 1
    const generation = pane.syntaxGeneration
    void this.applySyntaxHighlighting(pane, file, generation).catch(
      () => undefined
    )
  }

  private async applySyntaxHighlighting(
    pane: MountedPane,
    file: DiffFile,
    generation: number
  ): Promise<void> {
    if (this.options.syntaxHighlight === false) return
    if (!canUseShikiWorker()) return

    const syntaxText = joinSyntaxLines(pane.rows)
    const lang = shikiLanguageForFile(file)
    if (!lang) return

    const snapshot = createPieceTableSnapshot(syntaxText)
    const session = createShikiHighlighterSession({
      documentId: `${file.path}:${pane.side}`,
      languageId: file.languageId ?? lang,
      text: syntaxText,
      snapshot,
      langs: [lang],
      lang,
      theme: this.options.theme ?? DEFAULT_THEME,
      themes: [this.options.theme ?? DEFAULT_THEME],
    })
    if (!session) return

    if (pane.syntaxGeneration !== generation) {
      session.dispose()
      return
    }

    pane.syntaxSession = session
    const [theme, result] = await Promise.all([
      loadConfiguredTheme(this.options.theme),
      session.refresh(snapshot, syntaxText),
    ])
    if (pane.syntaxGeneration !== generation) {
      session.dispose()
      return
    }

    pane.view.setTheme(syntaxOnlyTheme(result.theme ?? theme))
    pane.tokens = result.tokens as readonly EditorToken[]
    pane.view.setTokens(pane.tokens)
  }

  private inlineHighlightName(side: MountedPane["side"]): string {
    return `${this.highlightPrefix}-${side}-inline`
  }
}

function selectedPathForFiles(
  files: readonly DiffFile[],
  current: string | null
): string | null {
  if (current && files.some((file) => file.path === current)) return current
  return files[0]?.path ?? null
}

function toggleSetValue(set: Set<number>, value: number): void {
  if (set.delete(value)) return

  set.add(value)
}

function normalizedWheelDelta(
  event: WheelEvent,
  element: HTMLElement
): { left: number; top: number } {
  const multiplier = wheelDeltaMultiplier(event, element)
  const top = event.shiftKey && event.deltaX === 0 ? 0 : event.deltaY
  const left =
    event.shiftKey && event.deltaX === 0 ? event.deltaY : event.deltaX
  return {
    left: left * multiplier,
    top: top * multiplier,
  }
}

function wheelDeltaMultiplier(event: WheelEvent, element: HTMLElement): number {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return WHEEL_LINE_DELTA
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return element.clientHeight

  return 1
}

function syntaxOnlyTheme(
  theme: EditorTheme | null | undefined
): EditorTheme | null {
  if (!theme) return null

  return { syntax: theme.syntax }
}

function rowDecorations(
  rows: readonly DiffRenderRow[]
): ReadonlyMap<number, VirtualizedTextRowDecoration> {
  const decorations = new Map<number, VirtualizedTextRowDecoration>()
  for (const [index, row] of rows.entries())
    decorations.set(index, decorationForRow(row))
  return decorations
}

function inlineHighlightRanges(
  rows: readonly DiffRenderRow[]
): readonly VirtualizedTextHighlightRange[] {
  const ranges: VirtualizedTextHighlightRange[] = []
  let offset = 0

  for (const row of rows) {
    appendInlineRanges(ranges, row, offset)
    offset += row.text.length + 1
  }

  return ranges
}

function appendInlineRanges(
  ranges: VirtualizedTextHighlightRange[],
  row: DiffRenderRow,
  rowOffset: number
): void {
  for (const range of row.inlineRanges ?? []) {
    if (range.end <= range.start) continue
    ranges.push({ start: rowOffset + range.start, end: rowOffset + range.end })
  }
}

function decorationForRow(row: DiffRenderRow): VirtualizedTextRowDecoration {
  const suffix = row.type
  const expandable = row.expandable ? " editor-diff-row-expandable" : ""
  return {
    className: `editor-diff-row editor-diff-row-${suffix}${expandable}`,
    gutterClassName: `editor-diff-gutter-row editor-diff-gutter-row-${suffix}`,
  }
}

function joinSyntaxLines(rows: readonly DiffRenderRow[]): string {
  return rows.map(syntaxLineText).join("\n")
}

function syntaxLineText(row: DiffRenderRow): string {
  if (
    row.type === "context" ||
    row.type === "addition" ||
    row.type === "deletion"
  ) {
    return row.text
  }

  return " ".repeat(row.text.length)
}

function shikiLanguageForFile(file: DiffFile): string | null {
  const languageId = file.languageId ?? languageIdForPath(file.path)
  if (languageId === "typescript" && pathExtension(file.path) === ".tsx")
    return "tsx"
  if (languageId === "javascript" && pathExtension(file.path) === ".jsx")
    return "jsx"
  return languageId
}

function pathExtension(path: string): string {
  const fileName = path.slice(path.lastIndexOf("/") + 1)
  const dotIndex = fileName.lastIndexOf(".")
  if (dotIndex === -1) return ""
  return fileName.slice(dotIndex).toLowerCase()
}

async function loadConfiguredTheme(
  theme: string | undefined
): Promise<EditorTheme | null> {
  return (await loadShikiTheme({ theme: theme ?? DEFAULT_THEME })) ?? null
}

function splitDefaultLayout(
  layout: Partial<DiffSplitPaneLayout> | undefined
): ResizablePaneLayout | undefined {
  if (!layout) return undefined
  if (layout.old !== undefined && layout.new !== undefined)
    return { old: layout.old, new: layout.new }
  if (layout.old !== undefined)
    return { old: layout.old, new: 100 - layout.old }
  if (layout.new !== undefined)
    return { old: 100 - layout.new, new: layout.new }
  return undefined
}

function diffSplitLayout(layout: ResizablePaneLayout): DiffSplitPaneLayout {
  return {
    old: layout.old ?? 0,
    new: layout.new ?? 0,
  }
}

function createDefaultSplitHandle(document: Document): HTMLElement {
  const handle = document.createElement("div")
  const line = document.createElement("span")
  handle.className = "editor-diff-split-handle"
  line.className = "editor-diff-split-handle-line"
  line.setAttribute("aria-hidden", "true")
  handle.appendChild(line)
  return handle
}
