import path from "node:path"

import { isRecord } from "@workspace/contracts"
import type * as lsp from "vscode-languageserver-protocol"

import type { SessionContext } from "../shared/context"


export function handleDidChange(ctx: SessionContext, params: unknown): void {
  const change = didChangeParams(params)
  if (!change) return

  const current = ctx.documents.get(change.uri)
  if (!current) return

  const text = applyContentChanges(current.text, change.contentChanges)
  const document = { ...current, version: change.version, text }
  ctx.documents.set(change.uri, document)
  ctx.bumpScriptVersion(document.fileName)
  if (isProjectMetadataFile(document.fileName)) ctx.invalidateForProjectConfigChange()
  else ctx.invalidateForFileContentChange(document.fileName)
  ctx.scheduleDiagnostics(document.uri)
}

function didChangeParams(params: unknown): {
  uri: lsp.DocumentUri
  version: number
  contentChanges: readonly lsp.TextDocumentContentChangeEvent[]
} | null {
  if (!isRecord(params)) return null
  if (!isRecord(params.textDocument)) return null
  if (!Array.isArray(params.contentChanges)) return null

  const textDocument = params.textDocument
  if (typeof textDocument.uri !== "string") return null
  if (typeof textDocument.version !== "number") return null

  return {
    uri: textDocument.uri,
    version: textDocument.version,
    contentChanges: params.contentChanges as lsp.TextDocumentContentChangeEvent[],
  }
}

function applyContentChanges(
  text: string,
  changes: readonly lsp.TextDocumentContentChangeEvent[],
): string {
  let nextText = text
  for (const change of changes) nextText = applyContentChange(nextText, change)
  return nextText
}

function applyContentChange(text: string, change: lsp.TextDocumentContentChangeEvent): string {
  if (!("range" in change) || !change.range) return change.text

  const start = lspPositionToOffset(text, change.range.start)
  const end = lspPositionToOffset(text, change.range.end)
  return `${text.slice(0, start)}${change.text}${text.slice(end)}`
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

function isProjectMetadataFile(fileName: string): boolean {
  const name = path.basename(fileName)
  return name === "tsconfig.json" || name === "package.json"
}
