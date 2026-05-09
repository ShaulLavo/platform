import path from "node:path"

import { isRecord } from "@workspace/contracts"
import ts from "typescript"
import type * as lsp from "vscode-languageserver-protocol"

import type { SessionContext } from "../shared/context"

/**
 * Handle a `textDocument/prepareRename` request.
 *
 * Asks the language service whether the symbol at the cursor can be renamed
 * and, if so, returns the triggering span together with the current display
 * name so the client can open a rename UI prefilled with the existing
 * identifier. Returns `null` when the language service reports the location
 * as non-renameable.
 *
 * Per the LSP spec and the existing session implementation the return value
 * is either `null` or the `{ range, placeholder }` struct form — the plain
 * `lsp.Range` form is also permitted by the signature but not emitted here.
 */
export function handlePrepareRename(
  ctx: SessionContext,
  params: unknown,
): lsp.Range | { range: lsp.Range; placeholder: string } | null {
  const request = textDocumentPosition(ctx, params)
  if (!request) return null

  const text = documentText(ctx, request.fileName)
  if (text === null) return null

  const offset = lspPositionToOffset(text, request.position)
  const info = ctx.getLanguageService().getRenameInfo(request.fileName, offset, {})
  if (!info.canRename) return null

  return {
    range: rangeFromTextSpan(text, info.triggerSpan),
    placeholder: info.displayName,
  }
}

type TextDocumentPositionRequest = {
  uri: lsp.DocumentUri
  fileName: string
  position: lsp.Position
}

function textDocumentPosition(
  ctx: SessionContext,
  params: unknown,
): TextDocumentPositionRequest | null {
  const request = textDocumentPositionParams(params)
  if (!request) return null

  const fileName = fileNameForUri(ctx, request.uri)
  if (!fileName) return null

  return { ...request, fileName }
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
