import type { WorkspaceSearchMatch } from "@workspace/contracts"

import type { WorkspaceSearchFileGroup } from "@/features/search/search-buffer-state"
import { searchMatchDisplay } from "@/features/search/search-match-display"
import {
  expandedSearchResultItems,
  type SearchResultId,
} from "@/features/search/search-result-items"

const SEARCH_RESULT_PREVIEW_MAX_LENGTH = 160

export type SearchResultDocumentRange = {
  end: number
  start: number
}

export type SearchResultDocumentLine =
  | {
      end: number
      itemId: SearchResultId
      path: string
      row: number
      start: number
      type: "header"
    }
  | {
      end: number
      itemId: SearchResultId
      match: WorkspaceSearchMatch
      matchRange: SearchResultDocumentRange | null
      path: string
      row: number
      start: number
      type: "match"
    }

export type SearchResultDocument = {
  highlights: readonly SearchResultDocumentRange[]
  lines: readonly SearchResultDocumentLine[]
  text: string
}

export type SearchResultOpenTarget = {
  match: WorkspaceSearchMatch | null
  path: string
}

type SearchResultDocumentLineInput =
  | {
      itemId: SearchResultId
      path: string
      type: "header"
    }
  | {
      itemId: SearchResultId
      match: WorkspaceSearchMatch
      matchRange: SearchResultDocumentRange | null
      path: string
      type: "match"
    }

export function searchResultDocument(
  groups: readonly WorkspaceSearchFileGroup[],
  query: string
): SearchResultDocument {
  const builder = createSearchResultDocumentBuilder()
  const lineNumberWidths = searchResultLineNumberWidths(groups)

  for (const item of expandedSearchResultItems(groups)) {
    if (item.type === "group") {
      builder.addHeader(item.id, item.group.path, searchResultHeaderText(item))
      continue
    }

    const width = lineNumberWidths.get(item.match.path) ?? 1
    builder.addMatch(
      item.id,
      item.match,
      searchResultMatchLineText(item.match, query, width)
    )
  }

  return builder.build()
}

export function searchResultDocumentSelection(
  document: SearchResultDocument,
  itemId: SearchResultId | null
): SearchResultDocumentRange | null {
  const line = searchResultDocumentLineForItem(document, itemId)
  if (!line) return null
  if (line.type === "match" && line.matchRange) return line.matchRange

  return { end: line.end, start: line.start }
}

export function searchResultDocumentTargetAtRow(
  document: SearchResultDocument,
  row: number
): SearchResultOpenTarget | null {
  const line = searchResultDocumentLineAtRow(document, row)
  if (!line) return null
  if (line.type === "header") return { match: null, path: line.path }

  return { match: line.match, path: line.path }
}

export function searchResultDocumentItemIdAtRow(
  document: SearchResultDocument,
  row: number
) {
  const line = searchResultDocumentLineAtRow(document, row)
  if (!line) return null

  return line.itemId
}

function createSearchResultDocumentBuilder() {
  const highlights: SearchResultDocumentRange[] = []
  const lines: SearchResultDocumentLine[] = []
  const textLines: string[] = []
  let offset = 0

  function addLine(text: string, line: SearchResultDocumentLineInput) {
    const row = textLines.length
    const start = offset
    const end = start + text.length
    lines.push({ ...line, end, row, start } as SearchResultDocumentLine)
    textLines.push(text)
    offset = end + 1
  }

  return {
    addHeader(itemId: SearchResultId, path: string, text: string) {
      addLine(text, {
        itemId,
        path,
        type: "header",
      })
    },
    addMatch(
      itemId: SearchResultId,
      match: WorkspaceSearchMatch,
      line: SearchResultMatchLine
    ) {
      const lineStart = offset
      const matchRange = absoluteMatchRange(lineStart, line)
      if (matchRange) highlights.push(matchRange)

      addLine(line.text, {
        itemId,
        match,
        matchRange,
        path: match.path,
        type: "match",
      })
    },
    build(): SearchResultDocument {
      return {
        highlights,
        lines,
        text: textLines.join("\n"),
      }
    },
  }
}

type SearchResultMatchLine = {
  displayRange: SearchResultDocumentRange | null
  prefixLength: number
  text: string
}

function searchResultHeaderText(
  item: Extract<
    ReturnType<typeof expandedSearchResultItems>[number],
    { type: "group" }
  >
) {
  const suffix =
    item.group.count === 1 ? "1 match" : `${item.group.count} matches`

  return singleLineSearchResultText(`${item.group.pathLabel} (${suffix})`)
}

function searchResultMatchLineText(
  match: WorkspaceSearchMatch,
  query: string,
  lineNumberWidth: number
): SearchResultMatchLine {
  const display = searchMatchDisplay(match, query, {
    maxLength: SEARCH_RESULT_PREVIEW_MAX_LENGTH,
  })
  const prefix = `${searchResultLocation(match).padStart(lineNumberWidth)}: `

  return {
    displayRange: display.range ?? null,
    prefixLength: prefix.length,
    text: `${prefix}${singleLineSearchResultText(display.text)}`,
  }
}

function singleLineSearchResultText(text: string) {
  return text.replace(/[\r\n]/gu, " ")
}

function absoluteMatchRange(
  lineStart: number,
  line: SearchResultMatchLine
): SearchResultDocumentRange | null {
  if (!line.displayRange) return null

  return {
    end: lineStart + line.prefixLength + line.displayRange.end,
    start: lineStart + line.prefixLength + line.displayRange.start,
  }
}

function searchResultLocation(match: WorkspaceSearchMatch) {
  if (match.kind === "name") return "name"
  if (match.line === undefined) return "match"

  return String(match.line)
}

function searchResultLineNumberWidths(
  groups: readonly WorkspaceSearchFileGroup[]
) {
  const widths = new Map<string, number>()
  for (const group of groups) {
    widths.set(group.path, searchResultLineNumberWidth(group.matches))
  }

  return widths
}

function searchResultLineNumberWidth(matches: readonly WorkspaceSearchMatch[]) {
  let width = 1
  for (const match of matches) {
    width = Math.max(width, searchResultLocation(match).length)
  }

  return width
}

function searchResultDocumentLineForItem(
  document: SearchResultDocument,
  itemId: SearchResultId | null
) {
  if (!itemId) return null

  return document.lines.find((line) => line.itemId === itemId) ?? null
}

function searchResultDocumentLineAtRow(
  document: SearchResultDocument,
  row: number
) {
  return document.lines.find((line) => line.row === row) ?? null
}
