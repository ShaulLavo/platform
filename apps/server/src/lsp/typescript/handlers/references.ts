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

export function handleReferences(
  ctx: SessionContext,
  params: unknown
): lsp.Location[] {
  const request = textDocumentPosition(ctx, params)
  if (!request) return []

  const text = documentText(ctx, request.fileName)
  if (text === null) return []

  const offset = lspPositionToOffset(text, request.position)
  const references =
    ctx
      .getLanguageService()
      .getReferencesAtPosition(request.fileName, offset) ?? []
  return references.flatMap((reference) =>
    locationForTextSpan(ctx, reference.fileName, reference.textSpan)
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
