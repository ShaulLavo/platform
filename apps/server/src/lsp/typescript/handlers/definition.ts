import ts from "typescript"
import type * as lsp from "vscode-languageserver-protocol"

import {
  documentText,
  documentUriForFileName,
  isInsidePath,
  lspPositionToOffset,
  normalizeNativePath,
  rangeFromTextSpan,
  textDocumentPosition,
} from "../shared/boundary"
import type { SessionContext } from "../shared/context"

export function handleDefinition(
  ctx: SessionContext,
  params: unknown
): lsp.Location[] {
  const request = textDocumentPosition(ctx, params)
  if (!request) return []

  const text = documentText(ctx, request.fileName)
  if (text === null) return []

  const service = ctx.getLanguageService()
  const offset = lspPositionToOffset(text, request.position)
  const definitions =
    service.getDefinitionAndBoundSpan(request.fileName, offset)?.definitions ??
    service.getDefinitionAtPosition(request.fileName, offset) ??
    []

  return definitions.flatMap((definition) =>
    locationForTextSpan(ctx, definition.fileName, definition.textSpan)
  )
}

function locationForTextSpan(
  ctx: SessionContext,
  fileName: string,
  span: ts.TextSpan
): readonly lsp.Location[] {
  const normalized = normalizeNativePath(fileName)
  if (!isInsidePath(ctx.root, normalized)) return []

  const text = documentText(ctx, normalized)
  if (text === null) return []

  return [
    {
      uri: documentUriForFileName(ctx, normalized),
      range: rangeFromTextSpan(text, span),
    },
  ]
}
