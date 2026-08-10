import {
  createSplitProjection,
  createStackedProjection,
  type DiffFile,
  type DiffRenderRow,
} from '@singapor/diff'

/** Which pane a row was read from — the split view's two, or the stacked one. */
export type DiffPaneSide = 'new' | 'old' | 'stacked'

export type DiffLineRange = { readonly start: number; readonly end: number }

/**
 * Which lines a comment is about, in the only terms the two sides of a diff both
 * agree on: a range on the pre-image and a range on the post-image.
 *
 * Either may be null — a pure deletion names no new line, a pure addition names
 * no old one — and "line 42" with neither side attached is exactly the ambiguity
 * this type exists to make unrepresentable.
 */
export type DiffLineAddress = {
  readonly newRange: DiffLineRange | null
  readonly oldRange: DiffLineRange | null
}

/**
 * The rows a pane renders, projected the same way the diff view projects them,
 * so a row index read off `data-editor-virtual-row` addresses the same row here.
 * The side comes from the pane element rather than from the view mode, so there
 * is no second copy of "which pane am I in" to fall out of step.
 */
export function diffPaneRows(
  file: DiffFile,
  side: DiffPaneSide,
  expandedHunks: ReadonlySet<number>,
): readonly DiffRenderRow[] {
  if (side === 'stacked') return createStackedProjection(file, { expandedHunks }).rows

  const projection = createSplitProjection(file, { expandedHunks })
  return side === 'old' ? projection.leftRows : projection.rightRows
}

/**
 * The rows a drag from `anchorRow` to `headRow` covers, in row order and without
 * the separators and padding rows that stand for no line on either side.
 */
export function selectedDiffRows(
  rows: readonly DiffRenderRow[],
  anchorRow: number,
  headRow: number,
): readonly DiffRenderRow[] {
  const start = Math.min(anchorRow, headRow)
  const end = Math.max(anchorRow, headRow)

  return rows.slice(start, end + 1).filter(isCodeRow)
}

export function diffLineAddress(rows: readonly DiffRenderRow[]): DiffLineAddress | null {
  const newRange = lineRange(rows, 'newLineNumber')
  const oldRange = lineRange(rows, 'oldLineNumber')
  if (!newRange && !oldRange) return null

  return { newRange, oldRange }
}

/**
 * Inverse of `diffLineAddress`: the contiguous block of rows an address names in
 * whatever projection is on screen now.
 *
 * Row indices die on a mode switch or a hunk expansion and line numbers do not,
 * which is why an address is what a selection is kept as — and why resolving it
 * against the stacked projection yields both sides of the change even when the
 * user dragged through a single split pane.
 *
 * Contiguous rather than "every matching row" so that what comes back is a diff
 * a reader can trust: the counts in a `@@` header only mean anything if nothing
 * was skipped between the first line and the last. Re-addressing the result is
 * therefore a fixed point — resolving it again cannot widen it further.
 */
export function diffRowsForAddress(
  rows: readonly DiffRenderRow[],
  address: DiffLineAddress,
): readonly DiffRenderRow[] {
  let first = -1
  let last = -1

  for (const [index, row] of rows.entries()) {
    if (!isCodeRow(row)) continue
    if (!addressCoversRow(address, row)) continue

    if (first < 0) first = index
    last = index
  }

  if (first < 0) return []

  return rows.slice(first, last + 1).filter(isCodeRow)
}

export function diffLineAddressLabel(address: DiffLineAddress): string {
  const sides: string[] = []
  if (address.newRange) sides.push(rangeLabel('new', address.newRange))
  if (address.oldRange) sides.push(rangeLabel('old', address.oldRange))

  return sides.join(', ')
}

/** What the agent receives: the file, the address, and the lines themselves. */
export function diffLineSelectionText(
  path: string,
  address: DiffLineAddress,
  rows: readonly DiffRenderRow[],
): string {
  const body = rows.map(markedLine)
  const fence = fenceFor(body)

  return [
    `About \`${path}\`, ${diffLineAddressLabel(address)}:`,
    '',
    `${fence}diff`,
    hunkHeader(address, rows),
    ...body,
    fence,
  ].join('\n')
}

/**
 * Mirrors the expansion the diff view keeps to itself: clicking an expandable
 * `@@` row splices context rows in, and every row index after it shifts. Holding
 * the same set is what keeps a row index read off the DOM meaning the same row
 * here.
 */
export function toggleExpandedHunk(
  expandedHunks: ReadonlySet<number>,
  row: DiffRenderRow | undefined,
): ReadonlySet<number> {
  if (row?.type !== 'hunk') return expandedHunks
  if (!row.expandable) return expandedHunks
  if (row.hunkIndex === undefined) return expandedHunks

  const next = new Set(expandedHunks)
  if (!next.delete(row.hunkIndex)) next.add(row.hunkIndex)

  return next
}

/**
 * The class the diff view decorates a row of this type with. Comparing it to the
 * element under the pointer is how a projection that has drifted from the pane
 * is caught, rather than silently addressing the wrong line.
 */
export function diffRowTypeClassName(row: DiffRenderRow): string {
  return `editor-diff-row-${row.type}`
}

function isCodeRow(row: DiffRenderRow): boolean {
  return row.type === 'addition' || row.type === 'context' || row.type === 'deletion'
}

function lineRange(
  rows: readonly DiffRenderRow[],
  key: 'newLineNumber' | 'oldLineNumber',
): DiffLineRange | null {
  let start = Number.POSITIVE_INFINITY
  let end = Number.NEGATIVE_INFINITY

  for (const row of rows) {
    const line = row[key]
    if (line === undefined) continue

    start = Math.min(start, line)
    end = Math.max(end, line)
  }

  if (end < start) return null

  return { end, start }
}

function addressCoversRow(address: DiffLineAddress, row: DiffRenderRow): boolean {
  if (coversLine(address.oldRange, row.oldLineNumber)) return true

  return coversLine(address.newRange, row.newLineNumber)
}

function coversLine(range: DiffLineRange | null, line: number | undefined): boolean {
  if (!range || line === undefined) return false

  return line >= range.start && line <= range.end
}

function rangeLabel(side: 'new' | 'old', range: DiffLineRange): string {
  if (range.start === range.end) return `${side} line ${range.start}`

  return `${side} lines ${range.start}-${range.end}`
}

function countLines(rows: readonly DiffRenderRow[], key: 'newLineNumber' | 'oldLineNumber') {
  return rows.reduce((count, row) => (row[key] === undefined ? count : count + 1), 0)
}

function hunkHeader(address: DiffLineAddress, rows: readonly DiffRenderRow[]): string {
  const oldPart = `-${address.oldRange?.start ?? 0},${countLines(rows, 'oldLineNumber')}`
  const newPart = `+${address.newRange?.start ?? 0},${countLines(rows, 'newLineNumber')}`

  return `@@ ${oldPart} ${newPart} @@`
}

function markedLine(row: DiffRenderRow): string {
  if (row.type === 'addition') return `+${row.text}`
  if (row.type === 'deletion') return `-${row.text}`

  return ` ${row.text}`
}

/** A selected line may itself contain a fence; the block has to outrun it. */
function fenceFor(lines: readonly string[]): string {
  const runs = lines.flatMap((line) => [...line.matchAll(/`+/g)].map((match) => match[0].length))

  return '`'.repeat(Math.max(3, Math.max(0, ...runs) + 1))
}
