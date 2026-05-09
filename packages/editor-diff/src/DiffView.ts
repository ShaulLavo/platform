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
import { createDiffGutterContribution } from "./gutters"
import { joinRenderLines, languageIdForPath } from "./lines"
import { createSplitProjection, createStackedProjection } from "./projection"
import type {
  DiffFile,
  DiffRenderRow,
  DiffViewMode,
  DiffViewOptions,
} from "./types"

type MountedPane = {
  readonly view: VirtualizedTextView
  readonly rows: readonly DiffRenderRow[]
  readonly side: "old" | "new" | "stacked"
  syntaxSession?: { dispose(): void }
}

const DEFAULT_THEME = "github-dark"
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
  private hunkRows: ReadonlyMap<number, number> = new Map()
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

  revealHunk(index: number): void {
    const row = this.hunkRows.get(index)
    if (row === undefined) return

    for (const pane of this.panes) pane.view.scrollToRow(row)
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
    const projection = createSplitProjection(file)
    this.hunkRows = projection.hunkRows
    const split = this.root.ownerDocument.createElement("div")
    split.className = "editor-diff-split"
    this.content.appendChild(split)
    const left = this.createPane(split, "old", projection.leftRows, file)
    const right = this.createPane(split, "new", projection.rightRows, file)
    this.panes = [left, right]
    this.installScrollSync(left.view, right.view)
  }

  private renderStackedFile(file: DiffFile): void {
    const projection = createStackedProjection(file)
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
    const view = new VirtualizedTextView(host, {
      className: "editor-diff-text editor-virtualized",
      gutterContributions: [createDiffGutterContribution(side, () => rows)],
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
    void this.applySyntaxHighlighting({ view, rows, side }, file).catch(
      (error: unknown) => {
        console.warn("[editor/diff] syntax highlighting failed", error)
      }
    )
    return { view, rows, side }
  }

  private installScrollSync(
    left: VirtualizedTextView,
    right: VirtualizedTextView
  ): void {
    left.scrollElement.addEventListener("scroll", () =>
      this.syncScroll(left, right)
    )
    right.scrollElement.addEventListener("scroll", () =>
      this.syncScroll(right, left)
    )
  }

  private syncScroll(
    source: VirtualizedTextView,
    target: VirtualizedTextView
  ): void {
    if (this.syncingScroll) return

    this.syncingScroll = true
    target.scrollElement.scrollTop = source.scrollElement.scrollTop
    target.scrollElement.scrollLeft = source.scrollElement.scrollLeft
    this.syncingScroll = false
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

  private disposePanes(): void {
    for (const pane of this.panes) {
      pane.syntaxSession?.dispose()
      pane.view.dispose()
    }
    this.panes = []
  }

  private async applySyntaxHighlighting(
    pane: MountedPane,
    file: DiffFile
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

    pane.syntaxSession = session
    const [theme, result] = await Promise.all([
      loadConfiguredTheme(this.options.theme),
      session.refresh(snapshot, syntaxText),
    ])
    pane.view.setTheme(result.theme ?? theme)
    pane.view.setTokens(result.tokens as readonly EditorToken[])
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
  return {
    className: `editor-diff-row editor-diff-row-${suffix}`,
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
