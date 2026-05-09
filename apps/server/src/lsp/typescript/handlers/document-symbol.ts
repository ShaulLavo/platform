import path from "node:path"

import { isRecord } from "@workspace/contracts"
import ts from "typescript"
import type * as lsp from "vscode-languageserver-protocol"

import type { SessionContext } from "../shared/context"


export function handleDocumentSymbol(
  ctx: SessionContext,
  params: unknown,
): lsp.DocumentSymbol[] {
  const document = textDocumentIdentifier(params)
  if (!document) return []

  const fileName = fileNameForUri(ctx, document.uri)
  if (!fileName) return []

  const text = documentText(ctx, fileName)
  if (text === null) return []

  const tree = ctx.getLanguageService().getNavigationTree(fileName)
  return tree.childItems?.flatMap((item) => documentSymbol(item, text)) ?? []
}

function documentSymbol(
  item: ts.NavigationTree,
  fallbackText: string,
): readonly lsp.DocumentSymbol[] {
  const span = item.spans[0]
  if (!span) return []

  const range = rangeFromTextSpan(fallbackText, span)
  return [
    {
      name: item.text || "<anonymous>",
      kind: symbolKind(item.kind),
      range,
      selectionRange: range,
      children: item.childItems?.flatMap((child) => documentSymbol(child, fallbackText)),
    },
  ]
}

function symbolKind(kind: string): lsp.SymbolKind {
  if (kind === ts.ScriptElementKind.moduleElement) return 2
  if (kind === ts.ScriptElementKind.classElement) return 5
  if (kind === ts.ScriptElementKind.enumElement) return 10
  if (kind === ts.ScriptElementKind.interfaceElement) return 11
  if (kind === ts.ScriptElementKind.functionElement) return 12
  if (kind === ts.ScriptElementKind.memberFunctionElement) return 6
  if (kind === ts.ScriptElementKind.memberVariableElement) return 7
  if (kind === ts.ScriptElementKind.constElement) return 13
  if (kind === ts.ScriptElementKind.letElement) return 13
  return 13
}

function textDocumentIdentifier(params: unknown): lsp.TextDocumentIdentifier | null {
  if (!isRecord(params)) return null
  if (!isRecord(params.textDocument)) return null
  return typeof params.textDocument.uri === "string"
    ? ({ uri: params.textDocument.uri } satisfies lsp.TextDocumentIdentifier)
    : null
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
