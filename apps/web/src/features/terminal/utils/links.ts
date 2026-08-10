import {
  resolveInlineCodeFileReference,
  type MarkdownFileReference,
} from '@/features/chat/lib/markdown-file-links'

/**
 * The slice of ghostty's `IBufferLine` link detection reads — the cell-level
 * shape its own URL provider uses, plus the wrap flag. Structural rather than
 * the interface itself so detection can be exercised without a WASM terminal.
 */
export type TerminalBufferLine = {
  readonly getCell: (x: number) => { readonly getCodepoint: () => number } | undefined
  /** True when this row continues the row above it. */
  readonly isWrapped: boolean
  readonly length: number
}

export type TerminalBufferLineReader = (row: number) => TerminalBufferLine | undefined

/** Inclusive at both ends and 0-based: the coordinates ghostty's `ILink` wants. */
export type TerminalLinkRange = {
  readonly end: TerminalBufferPosition
  readonly start: TerminalBufferPosition
}

export type TerminalPathLink = {
  readonly range: TerminalLinkRange
  readonly reference: MarkdownFileReference
  readonly text: string
}

type TerminalBufferPosition = {
  readonly x: number
  readonly y: number
}

type TerminalPathMatch = {
  readonly end: number
  readonly start: number
  readonly text: string
}

type WrappedTerminalLine = {
  readonly segments: readonly WrappedTerminalLineSegment[]
  readonly text: string
}

type WrappedTerminalLineSegment = {
  readonly endIndex: number
  readonly row: number
  readonly startIndex: number
  readonly text: string
}

/**
 * Either a token carrying a slash, or a dotted name with a `:line[:column]`
 * suffix — the two shapes compilers and stack traces print. Brackets and quotes
 * end a token so `at run (/abs/x.ts:9)` yields the path and not the wrapper.
 */
const PATH_PATTERN =
  /[^\s"'`<>|()[\]{}]*\/[^\s"'`<>|()[\]{}]*|[\w.-]+\.[A-Za-z\d_-]+(?::\d+){1,2}/gu
const TRAILING_PUNCTUATION = /[.,:;!?]+$/u
const MAX_CODEPOINT = 0x10_ffff

/**
 * Every file reference on the logical line that `row` belongs to.
 *
 * A terminal token is a whitespace-delimited literal, the same thing an inline
 * code span in a transcript is, so which candidates are really files — and how a
 * relative one resolves — stays with the shared resolver instead of becoming a
 * second policy that drifts from it.
 */
export function readTerminalPathLinks({
  getLine,
  rootPath,
  row,
}: {
  readonly getLine: TerminalBufferLineReader
  readonly rootPath: string | null
  readonly row: number
}): TerminalPathLink[] {
  const line = collectWrappedLine(row, getLine)
  if (!line) return []

  const links: TerminalPathLink[] = []
  for (const match of pathMatches(line.text)) {
    const reference = resolveInlineCodeFileReference(match.text, rootPath)
    if (!reference) continue

    links.push({ range: linkRange(line, match), reference, text: match.text })
  }

  return links
}

/**
 * Rebuilds the logical line the row belongs to. A path the emulator soft-wrapped
 * is still one path, and a detector that reads a single row only ever sees the
 * two halves — neither of which looks like a file.
 */
function collectWrappedLine(
  row: number,
  getLine: TerminalBufferLineReader,
): WrappedTerminalLine | null {
  const anchor = getLine(row)
  if (!anchor) return null

  const segments: WrappedTerminalLineSegment[] = []
  let current = firstRowOfWrappedLine(row, anchor, getLine)
  let startIndex = 0

  while (true) {
    const line = getLine(current)
    if (!line) break

    const text = bufferLineText(line)
    segments.push({ endIndex: startIndex + text.length, row: current, startIndex, text })
    startIndex += text.length

    if (!getLine(current + 1)?.isWrapped) break
    current += 1
  }

  return { segments, text: segments.map((segment) => segment.text).join('') }
}

function firstRowOfWrappedLine(
  row: number,
  anchor: TerminalBufferLine,
  getLine: TerminalBufferLineReader,
) {
  let first = row
  let line = anchor

  while (first > 0 && line.isWrapped) {
    const previous = getLine(first - 1)
    if (!previous) break

    first -= 1
    line = previous
  }

  return first
}

/**
 * Blank and control cells become spaces so a character index is also a column:
 * ghostty's `translateToString` drops them, which slides every later column left
 * and puts the link's range on the wrong cells.
 */
function bufferLineText(line: TerminalBufferLine) {
  const characters: string[] = []

  for (let x = 0; x < line.length; x += 1) {
    const codepoint = line.getCell(x)?.getCodepoint() ?? 0
    if (codepoint < 32 || codepoint > MAX_CODEPOINT) {
      characters.push(' ')
      continue
    }

    characters.push(String.fromCodePoint(codepoint))
  }

  return characters.join('')
}

function pathMatches(text: string): TerminalPathMatch[] {
  const matches: TerminalPathMatch[] = []

  for (const found of text.matchAll(PATH_PATTERN)) {
    const candidate = found[0].replace(TRAILING_PUNCTUATION, '')
    if (candidate.length === 0) continue

    matches.push({ end: found.index + candidate.length, start: found.index, text: candidate })
  }

  return matches
}

function linkRange(line: WrappedTerminalLine, match: TerminalPathMatch): TerminalLinkRange {
  return {
    end: bufferPosition(line.segments, match.end - 1),
    start: bufferPosition(line.segments, match.start),
  }
}

function bufferPosition(
  segments: readonly WrappedTerminalLineSegment[],
  index: number,
): TerminalBufferPosition {
  for (const segment of segments) {
    if (index >= segment.endIndex) continue

    return { x: index - segment.startIndex, y: segment.row }
  }

  const last = segments[segments.length - 1]
  return { x: Math.max(0, (last?.text.length ?? 1) - 1), y: last?.row ?? 0 }
}
