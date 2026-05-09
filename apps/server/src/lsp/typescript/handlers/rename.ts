import path from "node:path"

import { isRecord } from "@workspace/contracts"
import ts from "typescript"
import type * as lsp from "vscode-languageserver-protocol"

import type { SessionContext } from "../shared/context"

/**
 * Handle a `textDocument/rename` request.
 *
 * Asks the language service for every rename location touched by the symbol
 * under the cursor and projects the result into an LSP `WorkspaceEdit`.
 * Each location's `prefixText` and `suffixText` (used for things like
 * `{ foo: fooNewName }` shorthand-property expansion) are preserved so the
 * resulting edit matches the language-service output exactly.
 *
 * Returns `null` for malformed params, out-of-root URIs, or documents the
 * handler cannot read; returns a `WorkspaceEdit` with an empty `changes`
 * map when the language service finds no rename locations. Rename
 * locations that resolve outside the session root are skipped so we never
 * emit edits the client cannot apply.
 */
export function handleRename(ctx: SessionContext, params: unknown): lsp.WorkspaceEdit | null {
  const request = renameParams(params)
  if (!request) return null

  const fileName = fileNameForUri(ctx, request.uri)
  if (!fileName) return null

  const text = documentText(ctx, fileName)
  if (text === null) return null

  const offset = lspPositionToOffset(text, request.position)
  const locations =
    ctx.getLanguageService().findRenameLocations(fileName, offset, false, false, true) ?? []
  return workspaceEditFromRenameLocations(ctx, locations, request.newName)
}

function workspaceEditFromRenameLocations(
  ctx: SessionContext,
  locations: readonly ts.RenameLocation[],
  newName: string,
): lsp.WorkspaceEdit {
  const changes: Record<lsp.DocumentUri, lsp.TextEdit[]> = {}
  for (const location of locations) {
    appendTextChange(ctx, changes, location.fileName, {
      span: location.textSpan,
      newText: `${location.prefixText ?? ""}${newName}${location.suffixText ?? ""}`,
    })
  }

  return { changes }
}

function appendTextChange(
  ctx: SessionContext,
  changes: Record<lsp.DocumentUri, lsp.TextEdit[]>,
  fileName: string,
  textChange: ts.TextChange,
): void {
  const normalized = normalizeNativePath(fileName)
  if (!isInsidePath(ctx.root, normalized)) return

  const text = documentText(ctx, normalized)
  if (text === null) return

  const uri = documentUriForFileName(ctx, normalized)
  const edits = changes[uri] ?? []
  edits.push({
    range: rangeFromTextSpan(text, textChange.span),
    newText: textChange.newText,
  })
  changes[uri] = edits
}

function renameParams(params: unknown): {
  uri: lsp.DocumentUri
  position: lsp.Position
  newName: string
} | null {
  const request = textDocumentPositionParams(params)
  if (!request) return null
  if (!isRecord(params)) return null
  if (typeof params.newName !== "string") return null
  return { ...request, newName: params.newName }
}

function textDocumentPositionParams(params: unknown): {
  uri: lsp.DocumentUri
  position: lsp.Position
} | null {
  if (!isRecord(params)) return null
  if (!isRecord(params.textDocument)) return null
  if (!isRecord(params.position)) return null
  if (typeof params.textDocument.uri !== "string") return null
  if (typeof params.position.line !== "number") return null
  if (typeof params.position.character !== "number") return null

  return {
    uri: params.textDocument.uri,
    position: {
      line: params.position.line,
      character: params.position.character,
    },
  }
}

function documentText(ctx: SessionContext, fileName: string): string | null {
  const normalized = normalizeNativePath(fileName)
  for (const document of ctx.documents.values()) {
    if (samePath(document.fileName, normalized)) return document.text
  }
  if (!canReadFile(ctx, normalized)) return null
  return ts.sys.readFile(normalized) ?? null
}

function canReadFile(ctx: SessionContext, fileName: string): boolean {
  if (isInsidePath(ctx.root, fileName)) return true
  if (isInsidePath(ctx.workspaceRoot, fileName)) return true
  return isInsidePath(typeScriptLibDirectory(), fileName)
}

function fileNameForUri(ctx: SessionContext, uri: lsp.DocumentUri): string | null {
  const fileName = documentUriToFileName(uri)
  if (fileName && isInsidePath(ctx.root, fileName)) return fileName

  const workspaceFileName = documentUriToWorkspaceFileName(ctx.workspaceRoot, uri)
  if (!workspaceFileName) return null
  if (!isInsidePath(ctx.root, workspaceFileName)) return null
  return workspaceFileName
}

function documentUriToFileName(uri: string): string | null {
  try {
    const url = new URL(uri)
    if (url.protocol !== "file:") return null
    return normalizeNativePath(decodeURIComponent(url.pathname))
  } catch {
    return null
  }
}

function documentUriToWorkspaceFileName(workspaceRoot: string, uri: string): string | null {
  try {
    const url = new URL(uri)
    if (url.protocol !== "file:") return null

    const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, "")
    if (relativePath === "") return normalizeNativePath(workspaceRoot)
    return normalizeNativePath(path.join(workspaceRoot, relativePath))
  } catch {
    return null
  }
}

function documentUriForFileName(ctx: SessionContext, fileName: string): lsp.DocumentUri {
  const normalized = normalizeNativePath(fileName)
  if (!isInsidePath(ctx.workspaceRoot, normalized)) return fileNameToDocumentUri(normalized)

  const relativePath = path.relative(ctx.workspaceRoot, normalized)
  return relativePathToDocumentUri(relativePath)
}

function fileNameToDocumentUri(fileName: string): lsp.DocumentUri {
  const normalized = normalizeNativePath(fileName)
  return `file://${normalized.split("/").map(encodePathPart).join("/")}`
}

function relativePathToDocumentUri(relativePath: string): lsp.DocumentUri {
  const normalized = relativePath.split(path.sep).join("/").replace(/^\/+/, "")
  return `file:///${normalized.split("/").map(encodeURIComponent).join("/")}`
}

function encodePathPart(part: string, index: number): string {
  if (index === 0 && part === "") return ""
  return encodeURIComponent(part)
}

function rangeFromTextSpan(text: string, span: ts.TextSpan): lsp.Range {
  const start = clampOffset(span.start, text)
  const end = clampOffset(span.start + span.length, text)
  return {
    start: offsetToLspPosition(text, start),
    end: offsetToLspPosition(text, end),
  }
}

function offsetToLspPosition(text: string, offset: number): lsp.Position {
  const clamped = clampOffset(offset, text)
  let line = 0
  let lineStart = 0

  for (let index = 0; index < clamped; index += 1) {
    if (text[index] !== "\n") continue
    line += 1
    lineStart = index + 1
  }

  return { line, character: clamped - lineStart }
}

function lspPositionToOffset(text: string, position: lsp.Position): number {
  let line = 0
  let lineStart = 0

  for (let index = 0; index < text.length; index += 1) {
    if (line >= position.line) break
    if (text[index] !== "\n") continue
    line += 1
    lineStart = index + 1
  }

  if (line < position.line) return text.length
  return clampOffset(lineStart + position.character, text)
}

function clampOffset(offset: number, text: string): number {
  return Math.min(text.length, Math.max(0, offset))
}

function normalizeNativePath(input: string): string {
  return path.resolve(input).split(path.sep).join("/")
}

function samePath(left: string, right: string): boolean {
  return normalizeNativePath(left) === normalizeNativePath(right)
}

function isInsidePath(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  if (relative === "") return true
  if (relative.startsWith("..")) return false
  return !path.isAbsolute(relative)
}

function typeScriptLibDirectory(): string {
  return normalizeNativePath(path.dirname(ts.getDefaultLibFilePath({})))
}
