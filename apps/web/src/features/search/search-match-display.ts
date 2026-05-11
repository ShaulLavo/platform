import type { WorkspaceSearchMatch } from "@workspace/contracts"

export type SearchMatchDisplay = {
  range?: { end: number; start: number }
  text: string
}

export function searchMatchDisplay(
  match: WorkspaceSearchMatch,
  query: string
): SearchMatchDisplay {
  if (match.kind === "name") return searchQueryDisplay(match.path, query)

  const preview = searchMatchPreview(match)
  const range = searchMatchPreviewRange(match, preview)
  if (range) return searchRangeDisplay(preview, range)

  return searchQueryDisplay(preview, query)
}

function searchMatchPreview(match: WorkspaceSearchMatch) {
  return match.preview || "Matched line"
}

function searchMatchPreviewRange(match: WorkspaceSearchMatch, preview: string) {
  if (match.kind !== "content") return null
  if (match.column === undefined || match.endColumn === undefined) return null

  const previewStart = match.previewStartColumn ?? 0
  const start = match.column - 1 - previewStart
  const end = match.endColumn - 1 - previewStart
  if (start < 0 || end <= start) return null
  if (start >= preview.length) return null

  return { end: Math.min(end, preview.length), start }
}

function searchQueryDisplay(text: string, query: string) {
  const range = queryRange(text, query)
  if (!range) return { text }

  return searchRangeDisplay(text, range)
}

function queryRange(text: string, query: string) {
  if (!query) return null

  const start = text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase())
  if (start < 0) return null

  return {
    end: start + query.length,
    start,
  }
}

function searchRangeDisplay(
  text: string,
  range: { end: number; start: number }
) {
  const window = searchDisplayWindow(text, range)
  const prefix = window.start > 0 ? "..." : ""
  const suffix = window.end < text.length ? "..." : ""
  const windowText = text.slice(window.start, window.end)

  return {
    range: {
      end: prefix.length + range.end - window.start,
      start: prefix.length + range.start - window.start,
    },
    text: `${prefix}${windowText}${suffix}`,
  }
}

function searchDisplayWindow(
  text: string,
  range: { end: number; start: number }
) {
  const maxLength = 96
  const leadingContext = 24
  if (text.length <= maxLength) return { end: text.length, start: 0 }

  const start = Math.max(0, range.start - leadingContext)
  const end = Math.min(text.length, start + maxLength)
  if (range.end <= end) return { end, start }

  const shiftedStart = Math.max(0, range.end - maxLength)
  return {
    end: Math.min(text.length, shiftedStart + maxLength),
    start: shiftedStart,
  }
}
