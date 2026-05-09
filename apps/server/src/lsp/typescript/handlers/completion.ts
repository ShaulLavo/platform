import path from "node:path"

import { isRecord } from "@workspace/contracts"
import ts from "typescript"
import type * as lsp from "vscode-languageserver-protocol"

import type { SessionContext } from "../shared/context"

/**
 * Handle a `textDocument/completion` request.
 *
 * Queries the language service for completions at the cursor position and
 * converts each `ts.CompletionEntry` into an `lsp.CompletionItem`. When the
 * request is malformed, resolves outside the session root, cannot be read,
 * or the language service returns no completions, the handler returns an
 * empty (non-incomplete) completion list.
 */
export function handleCompletion(ctx: SessionContext, params: unknown): lsp.CompletionList {
  const request = textDocumentPosition(ctx, params)
  if (!request) return completionList([])

  const text = documentText(ctx, request.fileName)
  if (text === null) return completionList([])

  const offset = lspPositionToOffset(text, request.position)
  const completions = ctx.getLanguageService().getCompletionsAtPosition(request.fileName, offset, {
    includeCompletionsForModuleExports: true,
    includeCompletionsWithInsertText: true,
  })
  if (!completions) return completionList([])

  return completionList(completions.entries.map(completionItem))
}

function completionList(items: readonly lsp.CompletionItem[]): lsp.CompletionList {
  return { isIncomplete: false, items: [...items] }
}

function completionItem(entry: ts.CompletionEntry): lsp.CompletionItem {
  return {
    label: entry.name,
    kind: completionItemKind(entry.kind),
    sortText: entry.sortText,
    insertText: entry.insertText,
    detail: entry.sourceDisplay ? ts.displayPartsToString(entry.sourceDisplay) : undefined,
  }
}

function completionItemKind(kind: string): lsp.CompletionItemKind {
  if (kind === ts.ScriptElementKind.classElement) return 7
  if (kind === ts.ScriptElementKind.interfaceElement) return 8
  if (kind === ts.ScriptElementKind.memberFunctionElement) return 2
  if (kind === ts.ScriptElementKind.functionElement) return 3
  if (kind === ts.ScriptElementKind.memberVariableElement) return 5
  if (kind === ts.ScriptElementKind.constElement) return 6
  if (kind === ts.ScriptElementKind.letElement) return 6
  if (kind === ts.ScriptElementKind.moduleElement) return 9
  if (kind === ts.ScriptElementKind.keyword) return 14
  return 1
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
