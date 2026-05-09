import path from "node:path"

import { isRecord } from "@workspace/contracts"
import type * as lsp from "vscode-languageserver-protocol"

import type { SessionContext } from "../shared/context"

/**
 * File extensions the TypeScript language service recognizes as source.
 * Matches the set previously held in `session.ts`; duplicated here so the
 * handler module is self-contained during the Wave 3 parallel-extraction
 * window (Req 6.1). Task 5.12 will consolidate these helpers into a shared
 * module after `session.ts` is rewritten.
 */
const TYPE_SCRIPT_EXTENSIONS = new Set([".cts", ".mts", ".ts", ".tsx"])

/**
 * Handle a `textDocument/didOpen` notification (Req 6.1, Req 6.2).
 *
 * Validates the params shape, resolves the document URI to a path inside the
 * session root (Req 6.2 — documents outside the configured root are
 * ignored), and registers the document in the shared registry. After
 * registration the handler bumps the script version, triggers incremental
 * file-content invalidation so the language service observes the new text
 * without a full rebuild (Req 14.1, Req 14.2), and schedules diagnostic
 * publication.
 */
export function handleDidOpen(ctx: SessionContext, params: unknown): void {
  const textDocument = textDocumentItem(params)
  if (!textDocument) return

  const fileName = fileNameForUri(ctx, textDocument.uri)
  if (!fileName) return
  if (!isTypeScriptFileName(fileName)) return

  ctx.documents.set(textDocument.uri, {
    uri: textDocument.uri,
    fileName,
    languageId: textDocument.languageId,
    version: textDocument.version,
    text: textDocument.text,
  })
  ctx.bumpScriptVersion(fileName)
  ctx.invalidateForFileContentChange(fileName)
  ctx.scheduleDiagnostics(textDocument.uri)
}

function textDocumentItem(params: unknown): lsp.TextDocumentItem | null {
  if (!isRecord(params)) return null
  if (!isRecord(params.textDocument)) return null

  const textDocument = params.textDocument
  if (typeof textDocument.uri !== "string") return null
  if (typeof textDocument.languageId !== "string") return null
  if (typeof textDocument.version !== "number") return null
  if (typeof textDocument.text !== "string") return null
  return textDocument as unknown as lsp.TextDocumentItem
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

function normalizeNativePath(input: string): string {
  return path.resolve(input).split(path.sep).join("/")
}

function isInsidePath(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  if (relative === "") return true
  if (relative.startsWith("..")) return false
  return !path.isAbsolute(relative)
}

function isTypeScriptFileName(fileName: string): boolean {
  return TYPE_SCRIPT_EXTENSIONS.has(path.extname(fileName).toLowerCase())
}
