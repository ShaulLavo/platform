import path from "node:path"

import { isRecord } from "@workspace/contracts"
import ts from "typescript"
import type * as lsp from "vscode-languageserver-protocol"

import type { SessionContext } from "../shared/context"

/**
 * Handle a `textDocument/signatureHelp` request (Req 6.1, Req 6.2).
 *
 * Queries the TypeScript language service for signature-help items at the
 * cursor position and converts the result into the LSP `SignatureHelp`
 * shape. Returns `null` when params are malformed, the URI resolves outside
 * the session root, the document cannot be read, or the language service
 * reports no signature help — matching pre-extraction behavior (Req 6.4).
 */
export function handleSignatureHelp(
  ctx: SessionContext,
  params: unknown,
): lsp.SignatureHelp | null {
  const request = textDocumentPosition(ctx, params)
  if (!request) return null

  const text = documentText(ctx, request.fileName)
  if (text === null) return null

  const offset = lspPositionToOffset(text, request.position)
  const help = ctx.getLanguageService().getSignatureHelpItems(request.fileName, offset, undefined)
  if (!help) return null

  return signatureHelp(help)
}

function signatureHelp(help: ts.SignatureHelpItems): lsp.SignatureHelp {
  return {
    activeParameter: help.argumentIndex,
    activeSignature: help.selectedItemIndex,
    signatures: help.items.map(signatureInformation),
  }
}

function signatureInformation(item: ts.SignatureHelpItem): lsp.SignatureInformation {
  return {
    label: signatureLabel(item),
    documentation: ts.displayPartsToString(item.documentation),
    parameters: item.parameters.map((parameter) => ({
      label: ts.displayPartsToString(parameter.displayParts),
      documentation: ts.displayPartsToString(parameter.documentation),
    })),
  }
}

function signatureLabel(item: ts.SignatureHelpItem): string {
  const prefix = ts.displayPartsToString(item.prefixDisplayParts)
  const suffix = ts.displayPartsToString(item.suffixDisplayParts)
  const separator = ts.displayPartsToString(item.separatorDisplayParts)
  const parameters = item.parameters.map((parameter) =>
    ts.displayPartsToString(parameter.displayParts),
  )
  return `${prefix}${parameters.join(separator)}${suffix}`
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
