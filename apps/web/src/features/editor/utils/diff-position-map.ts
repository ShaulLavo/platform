import type { DiffRenderRow } from '@singapor/diff'

export type DiffFilePosition = {
  /** Zero-based, as LSP counts. `DiffRenderRow.newLineNumber` is one-based. */
  readonly line: number
  readonly character: number
}

/**
 * What a buffer offset turns out to be. Three answers rather than a position or null, deliberately.
 *
 * A feature handed `null` tends to fall back to asking anyway; a feature handed `old-side` has to
 * decide what to do about it. That decision is the one both prior arts got wrong by leaving it
 * implicit: VS Code has shipped an enabled, permanently no-opping "Go to definition" on `git:`
 * documents for nine years (microsoft/vscode#324356), and Zed guards deleted-hunk positions in
 * `completions.rs` and `code_actions.rs` while missing hover and go-to-definition. Both enumerated
 * call sites by hand. This type is the chokepoint neither of them had.
 */
export type DiffPositionLookup =
  /** A real line of the new file. The only answer a language server may be asked about. */
  | { readonly kind: 'file'; readonly position: DiffFilePosition }
  /** Real code, but from the pre-image — it exists only in the diff, never on disk. */
  | { readonly kind: 'old-side' }
  /** Padding, a `Show N unmodified lines` label, or a row whose text the projection blanked. */
  | { readonly kind: 'none' }

export type DiffPositionMap = {
  lookupAt(offset: number): DiffPositionLookup
  /** Where a new-file position sits in the buffer, or null when that line is not projected. */
  bufferOffsetAt(position: DiffFilePosition): number | null
}

/**
 * Translates between the diff's buffer and the new-side file.
 *
 * The buffer a diff editor holds is `joinRenderLines(rows)` — the two sides interleaved, plus
 * separator rows carrying a label and placeholder rows carrying nothing. So buffer line N is not
 * file line N, and anything position-based talking to a language server has to come through here.
 *
 * Only rows that stand for a real line of the NEW file map. Three kinds do not, and the third is
 * the one worth naming:
 *
 * - placeholders, which pad the short side of a change block and stand for nothing;
 * - separators, whose text is the `Show N unmodified lines` label;
 * - a row whose text the projection BLANKED. `renderLineText` empties any line that looks like a
 *   raw hunk header, so a file that itself contains `@@ -1,2 +3,4 @@` projects an empty row while
 *   the file line has content. Its line number is honest and its columns are not.
 *
 * The third is caught by comparing each row against the file line it claims, which also covers any
 * future divergence between the two without this needing to know about it. That check needs
 * `newLines`; a partial diff carries none, and then nothing maps — which is correct, because a
 * patch-only diff is not the file.
 */
export function createDiffPositionMap(
  rows: readonly DiffRenderRow[],
  newLines: readonly string[],
): DiffPositionMap {
  const starts: number[] = []
  const rowByLine = new Map<number, number>()
  let offset = 0

  for (const [index, row] of rows.entries()) {
    starts.push(offset)
    offset += row.text.length + 1
    if (!mapsToFile(row, newLines)) continue

    rowByLine.set(row.newLineNumber! - 1, index)
  }

  return {
    lookupAt(target) {
      const index = rowIndexAt(starts, target)
      const row = index === null ? undefined : rows[index]
      if (index === null || !row) return { kind: 'none' }
      if (!mapsToFile(row, newLines)) {
        // A deletion carries a real line of the OLD file. Naming it separately is what lets a
        // caller disable an affordance instead of offering one that silently answers nothing.
        return row.oldLineNumber !== undefined && row.type === 'deletion'
          ? { kind: 'old-side' }
          : { kind: 'none' }
      }

      const character = Math.min(Math.max(0, target - starts[index]!), row.text.length)
      return { kind: 'file', position: { character, line: row.newLineNumber! - 1 } }
    },
    bufferOffsetAt({ character, line }) {
      const index = rowByLine.get(line)
      if (index === undefined) return null

      const row = rows[index]!
      return starts[index]! + Math.min(Math.max(0, character), row.text.length)
    },
  }
}

/**
 * A row stands for a new-file line only if it claims one AND renders it verbatim.
 *
 * Deliberately not also a check on `row.type`. Placeholders, separators and the empty-diff row
 * carry no `newLineNumber` at all, so the first guard already has them, and a deletion only ever
 * carries an old one — a type list here would be a second spelling of the same thing that could
 * fall out of step with the projection. The verbatim check is what catches the case neither a
 * type nor a line number can see: a row the projection blanked.
 */
function mapsToFile(row: DiffRenderRow, newLines: readonly string[]): boolean {
  if (row.newLineNumber === undefined) return false

  return newLines[row.newLineNumber - 1] === row.text
}

/** The row containing an offset. Binary search, because a hover asks on every pointer move. */
function rowIndexAt(starts: readonly number[], offset: number): number | null {
  if (starts.length === 0 || offset < 0) return null

  let low = 0
  let high = starts.length - 1
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (starts[middle]! <= offset) low = middle
    else high = middle - 1
  }

  return low
}
