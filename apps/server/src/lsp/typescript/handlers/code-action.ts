import path from "node:path"

import { isRecord } from "@workspace/contracts"
import ts from "typescript"
import type * as lsp from "vscode-languageserver-protocol"

import type { SessionContext } from "../shared/context"

/**
 * Handle a `textDocument/codeAction` request.
 *
 * Collects the numeric TypeScript diagnostic codes carried in
 * `context.diagnostics`, asks the language service for quickfixes at the
 * selection range, and projects each `ts.CodeFixAction` into an LSP
 * `CodeAction` of kind `"quickfix"`. Returns an empty result for malformed
 * params, out-of-root URIs, documents the handler cannot read, or requests
 * whose diagnostics carry no TypeScript error codes.
 *
 * The return type is `readonly (lsp.Command | lsp.CodeAction)[]`; this
 * handler only emits `lsp.CodeAction` values.
 */
export function handleCodeAction(
  ctx: SessionContext,
  params: unknown,
): readonly (lsp.Command | lsp.CodeAction)[] {
  const request = codeActionParams(params)
  if (!request) return []

  const fileName = fileNameForUri(ctx, request.uri)
  if (!fileName) return []

  const text = documentText(ctx, fileName)
  if (text === null) return []

  const start = lspPositionToOffset(text, request.range.start)
  const end = lspPositionToOffset(text, request.range.end)
  const errorCodes = request.diagnostics.flatMap(diagnosticCode)
  if (errorCodes.length === 0) return []

  const fixes = ctx
    .getLanguageService()
    .getCodeFixesAtPosition(fileName, start, end, errorCodes, {}, {})
  return fixes.flatMap((fix) => codeActionFromFix(ctx, fix, request.diagnostics))
}

function codeActionFromFix(
  ctx: SessionContext,
  fix: ts.CodeFixAction,
  diagnostics: readonly lsp.Diagnostic[],
): readonly lsp.CodeAction[] {
  const edit = workspaceEditFromFileTextChanges(ctx, fix.changes)
  if (!edit) return []

  return [
    {
      title: fix.description,
      kind: "quickfix",
      diagnostics: [...diagnostics],
      edit,
    },
  ]
}

function workspaceEditFromFileTextChanges(
  ctx: SessionContext,
  changes: readonly ts.FileTextChanges[],
): lsp.WorkspaceEdit | null {
  const result: Record<lsp.DocumentUri, lsp.TextEdit[]> = {}
  for (const change of changes) appendFileTextChanges(ctx, result, change)
  if (Object.keys(result).length === 0) return null
  return { changes: result }
}

function appendFileTextChanges(
  ctx: SessionContext,
  changes: Record<lsp.DocumentUri, lsp.TextEdit[]>,
  fileChange: ts.FileTextChanges,
): void {
  for (const textChange of fileChange.textChanges) {
    appendTextChange(ctx, changes, fileChange.fileName, textChange)
  }
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

function codeActionParams(params: unknown): {
  uri: lsp.DocumentUri
  range: lsp.Range
  diagnostics: readonly lsp.Diagnostic[]
} | null {
  if (!isRecord(params)) return null
  if (!isRecord(params.textDocument)) return null
  if (!isRecord(params.range)) return null
  if (!isRecord(params.context)) return null
  if (typeof params.textDocument.uri !== "string") return null
  if (!isLspRange(params.range)) return null
  if (!Array.isArray(params.context.diagnostics)) return null

  return {
    uri: params.textDocument.uri,
    range: params.range,
    diagnostics: params.context.diagnostics as lsp.Diagnostic[],
  }
}

function isLspRange(value: Record<string, unknown>): value is lsp.Range {
  if (!isRecord(value.start)) return false
  if (!isRecord(value.end)) return false
  if (typeof value.start.line !== "number") return false
  if (typeof value.start.character !== "number") return false
  if (typeof value.end.line !== "number") return false
  return typeof value.end.character === "number"
}

function diagnosticCode(diagnostic: lsp.Diagnostic): readonly number[] {
  if (typeof diagnostic.code === "number") return [diagnostic.code]
  if (typeof diagnostic.code !== "string") return []
  const parsed = Number(diagnostic.code)
  return Number.isInteger(parsed) ? [parsed] : []
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
