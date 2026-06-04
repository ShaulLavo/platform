export type WorkspaceSearchPreview = {
  readonly startColumn: number
  readonly text: string
}

export type WorkspaceSearchPreviewOptions = {
  readonly contextChars?: number
  readonly maxChars?: number
}

const DEFAULT_WORKSPACE_SEARCH_PREVIEW_CONTEXT_CHARS = 80
const DEFAULT_WORKSPACE_SEARCH_PREVIEW_MAX_CHARS = 240

export function workspaceSearchPreview(
  line: string,
  columnIndex: number,
  endColumnIndex: number,
  options: WorkspaceSearchPreviewOptions = {},
): WorkspaceSearchPreview {
  const maxChars = options.maxChars ?? DEFAULT_WORKSPACE_SEARCH_PREVIEW_MAX_CHARS
  if (line.length <= maxChars) return { startColumn: 0, text: line }

  const contextChars = options.contextChars ?? DEFAULT_WORKSPACE_SEARCH_PREVIEW_CONTEXT_CHARS
  const latestStart = Math.max(0, line.length - maxChars)
  const preferredStart = Math.max(0, columnIndex - contextChars)
  const startColumn = workspaceSearchPreviewStart(line, Math.min(preferredStart, latestStart))
  const preferredEnd = Math.min(line.length, Math.max(endColumnIndex, startColumn + maxChars))
  const endColumn = workspaceSearchPreviewEnd(line, preferredEnd)

  return {
    startColumn,
    text: line.slice(startColumn, endColumn),
  }
}

function workspaceSearchPreviewStart(line: string, startColumn: number) {
  if (!workspaceSearchPreviewInsideIdentifier(line, startColumn)) return startColumn

  return workspaceSearchPreviewIdentifierStart(line, startColumn)
}

function workspaceSearchPreviewEnd(line: string, endColumn: number) {
  if (!workspaceSearchPreviewInsideIdentifier(line, endColumn)) return endColumn

  return workspaceSearchPreviewIdentifierEnd(line, endColumn)
}

function workspaceSearchPreviewInsideIdentifier(line: string, index: number) {
  if (index <= 0 || index >= line.length) return false
  if (!workspaceSearchPreviewIdentifierPart(line[index - 1] ?? '')) return false

  return workspaceSearchPreviewIdentifierPart(line[index] ?? '')
}

function workspaceSearchPreviewIdentifierStart(line: string, index: number) {
  let start = index
  while (start > 0 && workspaceSearchPreviewIdentifierPart(line[start - 1] ?? '')) start -= 1

  return start
}

function workspaceSearchPreviewIdentifierEnd(line: string, index: number) {
  let end = index
  while (end < line.length && workspaceSearchPreviewIdentifierPart(line[end] ?? '')) end += 1

  return end
}

function workspaceSearchPreviewIdentifierPart(char: string) {
  return /[$\u200c\u200d\p{ID_Continue}]/u.test(char)
}
