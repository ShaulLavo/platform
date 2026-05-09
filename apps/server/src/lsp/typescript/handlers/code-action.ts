import { isRecord } from "@workspace/contracts"
import ts from "typescript"
import type * as lsp from "vscode-languageserver-protocol"

import {
  documentText,
  documentUriForFileName,
  fileNameForUri,
  isInsidePath,
  lspPositionToOffset,
  normalizeNativePath,
  rangeFromTextSpan,
} from "../shared/boundary"
import type { SessionContext } from "../shared/context"

export function handleCodeAction(
  ctx: SessionContext,
  params: unknown
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
  return fixes.flatMap((fix) =>
    codeActionFromFix(ctx, fix, request.diagnostics)
  )
}

function codeActionFromFix(
  ctx: SessionContext,
  fix: ts.CodeFixAction,
  diagnostics: readonly lsp.Diagnostic[]
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
  changes: readonly ts.FileTextChanges[]
): lsp.WorkspaceEdit | null {
  const result: Record<lsp.DocumentUri, lsp.TextEdit[]> = {}
  for (const change of changes) appendFileTextChanges(ctx, result, change)
  if (Object.keys(result).length === 0) return null
  return { changes: result }
}

function appendFileTextChanges(
  ctx: SessionContext,
  changes: Record<lsp.DocumentUri, lsp.TextEdit[]>,
  fileChange: ts.FileTextChanges
): void {
  for (const textChange of fileChange.textChanges) {
    appendTextChange(ctx, changes, fileChange.fileName, textChange)
  }
}

function appendTextChange(
  ctx: SessionContext,
  changes: Record<lsp.DocumentUri, lsp.TextEdit[]>,
  fileName: string,
  textChange: ts.TextChange
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
