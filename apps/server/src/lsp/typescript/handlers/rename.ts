import { isRecord } from '@workspace/contracts'
import ts from 'typescript'
import type * as lsp from 'vscode-languageserver-protocol'

import {
  documentText,
  documentUriForFileName,
  fileNameForUri,
  isInsidePath,
  lspPositionToOffset,
  normalizeNativePath,
  rangeFromTextSpan,
  textDocumentPositionParams,
} from '../shared/boundary'
import type { SessionContext } from '../shared/context'

export function handleRename(ctx: SessionContext, params: unknown): lsp.WorkspaceEdit | null {
  const request = renameParams(params)
  if (!request) return null

  const fileName = fileNameForUri(ctx, request.uri)
  if (!fileName) return null

  const text = documentText(ctx, fileName)
  if (text === null) return null

  const offset = lspPositionToOffset(text, request.position)
  const locations =
    ctx.getLanguageService().findRenameLocations(fileName, offset, false, false, {
      providePrefixAndSuffixTextForRename: true,
    }) ?? []
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
      newText: `${location.prefixText ?? ''}${newName}${location.suffixText ?? ''}`,
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
  if (typeof params.newName !== 'string') return null
  return { ...request, newName: params.newName }
}
