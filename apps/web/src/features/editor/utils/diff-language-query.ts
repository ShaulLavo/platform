import type { DiffFilePosition, DiffPositionMap } from '@/features/editor/utils/diff-position-map'

export type DiffQueryTarget =
  /** Safe to ask a language server about, at this position in the file. */
  | { readonly kind: 'ask'; readonly position: DiffFilePosition }
  /** Real code from the pre-image. It is in no file, so nothing can be asked about it. */
  | { readonly kind: 'old-side' }
  /** Padding, a separator, or a new side that is not the text the server holds. */
  | { readonly kind: 'unavailable' }

/**
 * Whether a point in a diff may become a language-server question, and where.
 *
 * The gate is one comparison doing more work than it looks like. A language server's copy of a file
 * is whatever its owner last sent, so an answer about `(uri, position)` is only true if the text
 * we are pointing AT is the text the server HOLDS. A diff's new side is a snapshot taken when the
 * diff opened; the file may have been edited since, and then every line below the edit is off by
 * however many lines it added — and the server would answer, confidently, about the wrong code.
 *
 * Comparing the two texts settles it exactly. This is the check the VS Code thread raised and
 * dropped as racy (microsoft/vscode#34034) — and the raciness objection was to doing it ONCE, when
 * the editor loads. Done per request against the live text there is no window: either they are
 * equal at the moment of asking, or we do not ask.
 *
 * `ownedText` is null when nothing has the file open, and that is also a refusal — not because the
 * position would be wrong, but because opening it ourselves to fix that is exactly what would make
 * the diff a second owner of the document. Our proxy forwards an opener's text to the server, so a
 * diff that opened its interleaved buffer under the file's URI would repoint the server's copy for
 * every other client. VS Code and Zed both avoid this by making the modified side of a diff
 * literally the same document the editor tab holds; our buffer cannot be that, so we borrow the
 * question instead of the document.
 */
export function diffQueryTargetAt({
  map,
  newText,
  offset,
  ownedText,
}: {
  readonly map: DiffPositionMap
  readonly newText: string
  readonly offset: number
  readonly ownedText: string | null
}): DiffQueryTarget {
  const lookup = map.lookupAt(offset)
  if (lookup.kind === 'old-side') return { kind: 'old-side' }
  if (lookup.kind !== 'file') return { kind: 'unavailable' }
  if (ownedText === null || ownedText !== newText) return { kind: 'unavailable' }

  return { kind: 'ask', position: lookup.position }
}
